import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric } from '@/lib/money'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { UNCATEGORIZED_ID } from '@/features/categories/api'
import type { CategorySpendRow, ClassifiableTransaction } from '@/features/analytics/aggregate'

export interface CategoryComparison {
  categoryId: string
  categoryName: string
  /** `null` para el grupo "Sin categoría" (`UNCATEGORIZED_ID`) — el componente decide el color de
   *  respaldo (mismo criterio que `CategorySpendRow`). */
  color: string | null
  currentCents: number
  previousCents: number
  /** Comparación por PROMEDIO diario, no por total crudo — con `preset === 'month'` (ver
   *  `comparisonRange` en `period.ts`) el período anterior puede tener una cantidad de días
   *  distinta (una quincena de 15 contra una de 13–16), así que comparar los totales sin más sería
   *  peras contra manzanas. null cuando no había gasto en el período anterior — no hay porcentaje
   *  que tenga sentido. */
  changePct: number | null
}

async function fetchSpendByCategory(from: string, to: string) {
  const { data, error } = await supabase.rpc('v_spend_by_category', { p_from: from, p_to: to })
  if (error) throw error
  return data ?? []
}

function daysIn(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
}

/** Compara el gasto por categoría de `[from, to]` contra `[prevFrom, prevTo]` — quien llama decide
 *  cuál es el período anterior (`comparisonRange` en `period.ts`: el ciclo real anterior con
 *  `preset === 'month'`, o el mismo largo en días hacia atrás para el resto). */
export function useTopCategoriesComparison(from: string, to: string, prevFrom: string, prevTo: string) {
  const { user } = useAuth()
  const days = daysIn(from, to)
  const prevDays = daysIn(prevFrom, prevTo)

  return useQuery({
    queryKey: ['top-categories-comparison', user?.id, from, to, prevFrom, prevTo],
    enabled: !!user,
    queryFn: async (): Promise<CategoryComparison[]> => {
      const [current, previous] = await Promise.all([
        fetchSpendByCategory(from, to),
        fetchSpendByCategory(prevFrom, prevTo),
      ])

      const previousById = new Map(previous.map((row) => [row.category_id ?? UNCATEGORIZED_ID, centsFromNumeric(row.total)]))

      return current
        .map((row) => {
          const currentCents = centsFromNumeric(row.total)
          const previousCents = previousById.get(row.category_id ?? UNCATEGORIZED_ID) ?? 0
          const currentAvg = currentCents / days
          const previousAvg = previousCents / prevDays
          return {
            categoryId: row.category_id ?? UNCATEGORIZED_ID,
            categoryName: row.category_name,
            color: row.color,
            currentCents,
            previousCents,
            changePct: previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg) * 100 : null,
          }
        })
        // `v_spend_by_category` trae TODAS las categorías (LEFT JOIN, incluidas las que no
        // gastaron nada este período) — sin este filtro, una categoría sin uso este período
        // aparecía igual como "nuevo $0", aunque no haya nada que comparar.
        .filter((c) => c.currentCents > 0)
        .sort((a, b) => b.currentCents - a.currentCents)
    },
  })
}

function toCategorySpendRows(rows: Awaited<ReturnType<typeof fetchSpendByCategory>>): CategorySpendRow[] {
  return rows.map((row) => ({
    categoryId: row.category_id ?? UNCATEGORIZED_ID,
    categoryName: row.category_name,
    color: row.color,
    cents: centsFromNumeric(row.total),
  }))
}

/** Total gastado en el período de comparación (`comparisonRange` en `period.ts`) — para el "−6,1%
 *  vs. agosto" del hero de Análisis, que Analisis.tsx convierte a promedio diario antes de comparar
 *  (mismo motivo que `useTopCategoriesComparison`). Sin filtrar por categoría (a diferencia de esa
 *  otra, que sólo suma las categorías que sobrevivieron al período actual): acá hace falta el total
 *  real, aunque una categoría se haya vaciado del todo de un período al otro. */
export function usePreviousPeriodTotal(prevFrom: string, prevTo: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['previous-period-total', user?.id, prevFrom, prevTo],
    enabled: !!user,
    queryFn: async () => {
      const rows = await fetchSpendByCategory(prevFrom, prevTo)
      return toCategorySpendRows(rows).reduce((sum, r) => sum + r.cents, 0)
    },
  })
}

/** `v_spend_by_category` mes a mes, para los 12 meses terminados en el mes de `anchor` — no hay
 *  RPC que devuelva esto de una sola vez (a diferencia de `rpc_monthly_series`, que sólo trae
 *  ingreso/gasto/neto totales, sin desglose por categoría), así que son 12 pedidos en paralelo.
 *  Cada elemento del array de vuelta es un mes, mismo orden ascendente que `months`; el último es
 *  siempre el mes ancla — lo usan `summarizeCategoryMonthlyAverages` (columna "ahora") y el
 *  promedio de los 12 (columna "promedio"). */
export function useCategoryMonthlySeries(anchor: string) {
  const { user } = useAuth()
  const anchorMonth = format(startOfMonth(parseISO(anchor)), 'yyyy-MM-dd')
  const months = Array.from({ length: 12 }, (_, i) => format(startOfMonth(subMonths(parseISO(anchorMonth), 11 - i)), 'yyyy-MM-dd'))

  return useQuery({
    queryKey: ['category-monthly-series', user?.id, anchorMonth],
    enabled: !!user,
    queryFn: async (): Promise<CategorySpendRow[][]> => {
      const results = await Promise.all(
        months.map((m) => fetchSpendByCategory(m, format(endOfMonth(parseISO(m)), 'yyyy-MM-dd'))),
      )
      return results.map(toCategorySpendRows)
    },
  })
}

/** Tope explícito de PostgREST — mismo motivo que `TRANSACTIONS_ROW_LIMIT` en `transactions/api.ts`. */
const CLASSIFICATION_PAGE_SIZE = 1000

/** Todos los gastos del rango, con sólo las columnas que necesita "Fijo vs. variable" — a
 *  diferencia de `useTransactions` (usado por Movimientos, con su propio `TRANSACTIONS_ROW_LIMIT`),
 *  pagina con `fetchAllPages` para no cortar en silencio a los 1000 (AN-10 del QA de Análisis: con
 *  más de 1000 gastos en el rango, "Fijo vs. variable" contaba menos que el hero, que sí es un RPC
 *  agregado sin tope). La query key arranca con `'transactions'` para que
 *  `TRANSACTION_QUERY_KEYS` (`transactions/queryKeys.ts`) la invalide igual que a `useTransactions`. */
export function useExpenseRowsForClassification(from: string, to: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, 'classification', from, to],
    enabled: !!user,
    queryFn: async (): Promise<ClassifiableTransaction[]> => {
      const rows = await fetchAllPages(async (offset, limit) => {
        const { data, error } = await supabase
          .from('transactions')
          .select('id, type, amount, is_adjustment, fixed_expense_payment_id, is_credit_card_payment')
          .eq('type', 'expense')
          .gte('occurred_on', from)
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)
        if (error) throw error
        return data ?? []
      }, CLASSIFICATION_PAGE_SIZE)

      return rows.map((row) => ({ ...row, cents: centsFromNumeric(row.amount) }))
    },
  })
}
