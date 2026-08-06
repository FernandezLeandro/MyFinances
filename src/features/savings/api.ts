import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Database } from '@/lib/database.types'

export type SavingsBucket = Database['public']['Tables']['savings_buckets']['Row']

/**
 * `amount` y `rate_to_main` quedan como el `numeric` crudo que devuelve PostgREST — a diferencia del
 * resto de la plata en la app, acá la escala depende del activo (2 decimales para dinero/acciones,
 * 8 para cripto), así que la conversión a unidades pasa por `aggregate.ts`, que es quien ya necesita
 * la lista de activos para resolver precios. `rate_to_main` sí es siempre ARS con 2 decimales (es
 * plata), independientemente del activo que valúa.
 */
export type SavingsEntry = Database['public']['Tables']['savings_entries']['Row']

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['savings-buckets', userId] })
  queryClient.invalidateQueries({ queryKey: ['savings-entries', userId] })
}

export function useSavingsBuckets(includeArchived = false) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['savings-buckets', user?.id, includeArchived],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from('savings_buckets').select('*').order('sort_order')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

/** Todos los aportes del usuario, de todos los ítems — son pocas decenas de filas, se agregan en el cliente. */
export function useSavingsEntries() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['savings-entries', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('savings_entries')
        .select('*')
        .order('occurred_on', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export interface BucketInput {
  name: string
  singleCurrency: boolean
  includeInTotal: boolean
}

export function useCreateBucket() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: BucketInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('savings_buckets').insert({
        user_id: user.id,
        name: input.name,
        single_currency: input.singleCurrency,
        include_in_total: input.includeInTotal,
        sort_order: 999,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUpdateBucket() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<BucketInput> & { id: string; isArchived?: boolean }) => {
      const { error } = await supabase
        .from('savings_buckets')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.singleCurrency !== undefined && { single_currency: input.singleCurrency }),
          ...(input.includeInTotal !== undefined && { include_in_total: input.includeInTotal }),
          ...(input.isArchived !== undefined && { is_archived: input.isArchived }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export interface SavingsEntryInput {
  bucketId: string
  kind: 'deposit' | 'withdrawal'
  assetId: string
  /** `numeric` ya formateado en la escala de decimales del activo — lo arma el form, que es quien
   *  conoce el activo elegido (vía `unitsToNumeric`). */
  amount: string
  /** ARS por unidad, `numeric` ya formateado (2 decimales de plata). `null` si no se cargó. */
  rateToMain: string | null
  occurredOn: string
  note: string | null
}

export function useCreateSavingsEntry() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SavingsEntryInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('savings_entries').insert({
        user_id: user.id,
        bucket_id: input.bucketId,
        kind: input.kind,
        asset_id: input.assetId,
        amount: input.amount,
        rate_to_main: input.rateToMain,
        occurred_on: input.occurredOn,
        note: input.note,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUpdateSavingsEntry() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: SavingsEntryInput & { id: string }) => {
      const { error } = await supabase
        .from('savings_entries')
        .update({
          kind: input.kind,
          asset_id: input.assetId,
          amount: input.amount,
          rate_to_main: input.rateToMain,
          occurred_on: input.occurredOn,
          note: input.note,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useDeleteSavingsEntry() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
