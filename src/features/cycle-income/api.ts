import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { CycleKind } from '@/lib/cycle'
import type { Database } from '@/lib/database.types'

type CycleIncomeRowRaw = Database['public']['Tables']['cycle_incomes']['Row']

/** Sueldo (u otro ingreso) que el usuario asignó a un ciclo — pensado para BASIC, que no registra
 *  movimientos manuales y por eso no tiene otra forma de saber "cuánto dinero me queda" este ciclo.
 *  Ledger, no un valor único: se puede cargar en partes (adelanto + resto) y cada entrada se puede
 *  quitar sin perder las demás — mismo criterio que `fixed_expense_savings`. Ver
 *  `20260912040001_cycle_incomes.sql`. */
export interface CycleIncome extends Omit<CycleIncomeRowRaw, 'amount'> {
  amountCents: number
}

function toIncome(row: CycleIncomeRowRaw): CycleIncome {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ['cycle-incomes', userId] })
}

/** Las entradas de sueldo de un ciclo puntual — Hoy sólo mira el ciclo en curso, así que alcanza con
 *  un `cycleId` a la vez (a diferencia de los guardados de fijos, que necesitan varios meses a la
 *  vez para el ciclo semanal a caballo de dos meses). */
export function useCycleIncomes(cycleKind: CycleKind, cycleId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['cycle-incomes', user?.id, cycleKind, cycleId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycle_incomes')
        .select('*')
        .eq('cycle_kind', cycleKind)
        .eq('cycle_id', cycleId)
        .order('received_at', { ascending: false })
      if (error) throw error
      return data.map(toIncome)
    },
  })
}

export function useAddCycleIncome() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      cycleKind,
      cycleId,
      cents,
      note,
    }: {
      cycleKind: CycleKind
      cycleId: string
      cents: number
      note?: string | null
    }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('cycle_incomes').insert({
        user_id: user.id,
        cycle_kind: cycleKind,
        cycle_id: cycleId,
        amount: centsToNumeric(cents),
        note: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo asignar el sueldo. Probá de nuevo.' },
  })
}

export function useRemoveCycleIncome() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ incomeId }: { incomeId: string }) => {
      const { error } = await supabase.from('cycle_incomes').delete().eq('id', incomeId)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
