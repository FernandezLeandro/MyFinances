import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Database } from '@/lib/database.types'
import type { DollarType } from '@/features/fx/quotes'

/**
 * `amount` y `quantity` quedan como el `numeric` crudo que devuelve PostgREST: la escala de
 * `quantity` depende del activo (2 decimales en ARS/USD, 8 en el resto), así que la conversión a
 * unidades enteras pasa por `aggregate.ts`, que es quien tiene la lista de activos.
 */
export type Investment = Database['public']['Tables']['investments']['Row']

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['investments', userId] })
  // El uso de cada categoría cuenta también las inversiones.
  queryClient.invalidateQueries({ queryKey: ['category-usage-counts', userId] })
}

/** Todas las inversiones de la cuenta — son pocas decenas, se filtran y agregan en el cliente. */
export function useInvestments() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['investments', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investments')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export interface InvestmentInput {
  categoryId: string | null
  assetId: string
  /** ARS pagados, `numeric` ya formateado (2 decimales). */
  amount: string
  /** Cantidad real recibida, `numeric` ya formateado en la escala del activo. */
  quantity: string
  /** Dólar con el que se valúa: sólo USD. `null` en ARS y en activos de mercado. */
  fxSource: DollarType | null
  /** Pesos por unidad al comprar (por dólar, por USDT…), `numeric` ya formateado. `null` sólo en ARS. */
  buyPrice: string | null
  occurredOn: string
  description: string | null
}

function toRow(input: InvestmentInput) {
  return {
    category_id: input.categoryId,
    asset_id: input.assetId,
    amount: input.amount,
    quantity: input.quantity,
    fx_source: input.fxSource,
    buy_price: input.buyPrice,
    occurred_on: input.occurredOn,
    description: input.description,
  }
}

export function useCreateInvestment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: InvestmentInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('investments').insert({ user_id: user.id, ...toRow(input) })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUpdateInvestment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: InvestmentInput & { id: string }) => {
      const { error } = await supabase.from('investments').update(toRow(input)).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useDeleteInvestment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('investments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
