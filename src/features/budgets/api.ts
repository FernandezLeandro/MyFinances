import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type SpendingBudgetRowRaw = Database['public']['Tables']['spending_budgets']['Row']

export interface SpendingBudget extends Omit<SpendingBudgetRowRaw, 'amount'> {
  cents: number
}

function toSpendingBudget(row: SpendingBudgetRowRaw): SpendingBudget {
  const { amount, ...rest } = row
  return { ...rest, cents: centsFromNumeric(amount) }
}

/** El presupuesto de gasto variable (hoy sólo "Comida") — una fila por cuenta, o ninguna todavía
 *  si nunca se cargó. RLS ya lo limita a la propia cuenta, por eso no hace falta filtrar por
 *  `user_id` acá — mismo criterio que `balance_locations`/`receivables`. */
export function useSpendingBudget() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['spending-budget', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('spending_budgets').select('*').maybeSingle()
      if (error) throw error
      return data ? toSpendingBudget(data) : null
    },
  })
}

/** Alta/edición en un solo mutation: `spending_budgets` tiene `unique (user_id)`, así que un
 *  `upsert` con `onConflict: 'user_id'` cubre los dos casos sin tener que distinguir si ya existe
 *  una fila. */
export function useUpsertSpendingBudget() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; cents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase
        .from('spending_budgets')
        .upsert({ user_id: user.id, name: input.name, amount: centsToNumeric(input.cents) }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending-budget', user?.id] })
      // Cuarto término de rpc_projected_balance — sin esto el número grande del panel queda
      // desactualizado hasta el próximo refetch por otra causa.
      queryClient.invalidateQueries({ queryKey: ['projected-balance', user?.id] })
    },
    meta: { errorMessage: 'No se pudo guardar el presupuesto. Probá de nuevo.' },
  })
}

export function useDeleteSpendingBudget() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spending_budgets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending-budget', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['projected-balance', user?.id] })
    },
    meta: { errorMessage: 'No se pudo eliminar el presupuesto. Probá de nuevo.' },
  })
}
