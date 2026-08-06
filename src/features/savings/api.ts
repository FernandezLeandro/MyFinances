import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric, type Currency } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type BucketRow = Database['public']['Tables']['savings_buckets']['Row']
type EntryRow = Database['public']['Tables']['savings_entries']['Row']

export type SavingsBucket = BucketRow

export interface SavingsEntry extends Omit<EntryRow, 'amount' | 'rate_to_main' | 'currency' | 'kind'> {
  cents: number
  /** Centavos de ARS que costó 1 unidad de `currency` ese día. `null` en ARS o si no se cargó. */
  rateToMainCents: number | null
  currency: Currency
  kind: 'deposit' | 'withdrawal'
}

function toEntry(row: EntryRow): SavingsEntry {
  const { amount, rate_to_main, currency, kind, ...rest } = row
  return {
    ...rest,
    cents: centsFromNumeric(amount),
    rateToMainCents: rate_to_main == null ? null : centsFromNumeric(rate_to_main),
    currency: currency as Currency,
    kind,
  }
}

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
      return data.map(toEntry)
    },
  })
}

export interface BucketInput {
  name: string
  singleCurrency: boolean
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
  currency: Currency
  cents: number
  /** Cotización de compra en centavos de ARS por unidad — sólo aplica y sólo es opcional en USD. */
  rateToMainCents: number | null
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
        currency: input.currency,
        amount: centsToNumeric(input.cents),
        rate_to_main: input.rateToMainCents == null ? null : centsToNumeric(input.rateToMainCents),
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
          currency: input.currency,
          amount: centsToNumeric(input.cents),
          rate_to_main: input.rateToMainCents == null ? null : centsToNumeric(input.rateToMainCents),
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
