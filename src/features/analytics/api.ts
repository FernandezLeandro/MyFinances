import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, subDays, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric } from '@/lib/money'

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
  const days = differenceInCalendarDays(new Date(to), new Date(from)) + 1
  const prevTo = format(subDays(new Date(from), 1), 'yyyy-MM-dd')
  const prevFrom = format(subDays(new Date(from), days), 'yyyy-MM-dd')

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
        .sort((a, b) => b.currentCents - a.currentCents)
    },
  })
}
