import { useQuery } from '@tanstack/react-query'
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric } from '@/lib/money'
import { previousRange } from '@/features/analytics/period'
import type { CategorySpendRow } from '@/features/analytics/aggregate'

export interface MonthlyPoint {
  period: string
  incomeCents: number
  expenseCents: number
  netCents: number
  runningBalanceCents: number
}

export function useMonthlySeries(from: string, to: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['monthly-series', user?.id, from, to],
    enabled: !!user,
    queryFn: async (): Promise<MonthlyPoint[]> => {
      const { data, error } = await supabase.rpc('rpc_monthly_series', { p_from: from, p_to: to })
      if (error) throw error
      return (data ?? []).map((row) => ({
        period: row.period,
        incomeCents: centsFromNumeric(row.total_income),
        expenseCents: centsFromNumeric(row.total_expense),
        netCents: centsFromNumeric(row.net),
        runningBalanceCents: centsFromNumeric(row.running_balance),
      }))
    },
  })
}

export interface CategoryComparison {
  categoryId: string
  categoryName: string
  color: string
  currentCents: number
  previousCents: number
  /** null cuando no había gasto en el período anterior — no hay porcentaje que tenga sentido. */
  changePct: number | null
}

async function fetchSpendByCategory(from: string, to: string) {
  const { data, error } = await supabase.rpc('v_spend_by_category', { p_from: from, p_to: to })
  if (error) throw error
  return data ?? []
}

/** Compara el gasto por categoría del período elegido contra el período inmediatamente anterior
 * de igual duración (p.ej. "últimos 30 días" vs. los 30 anteriores a esos). */
export function useTopCategoriesComparison(from: string, to: string) {
  const { user } = useAuth()
  const { from: prevFrom, to: prevTo } = previousRange(from, to)

  return useQuery({
    queryKey: ['top-categories-comparison', user?.id, from, to],
    enabled: !!user,
    queryFn: async (): Promise<CategoryComparison[]> => {
      const [current, previous] = await Promise.all([
        fetchSpendByCategory(from, to),
        fetchSpendByCategory(prevFrom, prevTo),
      ])

      const previousById = new Map(previous.map((row) => [row.category_id, centsFromNumeric(row.total)]))

      return current
        .map((row) => {
          const currentCents = centsFromNumeric(row.total)
          const previousCents = previousById.get(row.category_id) ?? 0
          return {
            categoryId: row.category_id,
            categoryName: row.category_name,
            color: row.color,
            currentCents,
            previousCents,
            changePct: previousCents > 0 ? ((currentCents - previousCents) / previousCents) * 100 : null,
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
    categoryId: row.category_id,
    categoryName: row.category_name,
    color: row.color,
    cents: centsFromNumeric(row.total),
  }))
}

/** Total gastado en el período inmediatamente anterior a `[from, to]` — para el "−6,1% vs. agosto"
 *  del hero de Análisis. Sin filtrar por categoría (a diferencia de `useTopCategoriesComparison`,
 *  que sólo suma las categorías que sobrevivieron al período actual): acá hace falta el total real,
 *  aunque una categoría se haya vaciado del todo de un período al otro. */
export function usePreviousPeriodTotal(from: string, to: string) {
  const { user } = useAuth()
  const { from: prevFrom, to: prevTo } = previousRange(from, to)

  return useQuery({
    queryKey: ['previous-period-total', user?.id, from, to],
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
