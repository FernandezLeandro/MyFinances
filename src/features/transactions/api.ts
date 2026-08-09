import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type TransactionRowRaw = Database['public']['Tables']['transactions']['Row']
export type TransactionType = TransactionRowRaw['type']

export interface Transaction extends Omit<TransactionRowRaw, 'amount'> {
  cents: number
}

export interface TransactionFilters {
  from: string
  to: string
  type?: TransactionType
  categoryId?: string
  text?: string
}

function toTransaction(row: TransactionRowRaw): Transaction {
  const { amount, ...rest } = row
  return { ...rest, cents: centsFromNumeric(amount) }
}

export function useTransactions(filters: TransactionFilters) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, filters],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select('*')
        .gte('occurred_on', filters.from)
        .lte('occurred_on', filters.to)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.type) query = query.eq('type', filters.type)
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.text) query = query.ilike('description', `%${filters.text}%`)

      const { data, error } = await query
      if (error) throw error
      return data.map(toTransaction)
    },
  })
}

/** Para el "Últimos movimientos" de Hoy: los más recientes en el tiempo, sin acotar al mes. */
export function useRecentTransactions(limit = 6) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, 'recent', limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map(toTransaction)
    },
  })
}

export function useCurrentBalance() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['balance', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_current_balance')
      if (error) throw error
      // El RPC devuelve `numeric` como string vía PostgREST, igual que las columnas.
      return centsFromNumeric(String(data ?? 0))
    },
  })
}

export function useMonthlySummary(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['monthly-summary', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('v_monthly_summary', { p_period: period })
      if (error) throw error
      const row = data?.[0]
      return {
        totalIncome: centsFromNumeric(row?.total_income ?? '0'),
        totalExpense: centsFromNumeric(row?.total_expense ?? '0'),
        balance: centsFromNumeric(row?.balance ?? '0'),
      }
    },
  })
}

export function useSpendByCategory(from: string, to: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['spend-by-category', user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('v_spend_by_category', { p_from: from, p_to: to })
      if (error) throw error
      return (data ?? [])
        .map((row) => ({
          categoryId: row.category_id,
          categoryName: row.category_name,
          color: row.color,
          cents: centsFromNumeric(row.total),
        }))
        .filter((row) => row.cents > 0)
    },
  })
}

export interface TransactionInput {
  type: TransactionType
  cents: number
  occurredOn: string
  categoryId: string | null
  description: string | null
  /** Movimiento creado por "Ajustar saldo" — sin categoría, afuera de Análisis, pero cuenta para el saldo. */
  isAdjustment?: boolean
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['monthly-summary', userId] })
  queryClient.invalidateQueries({ queryKey: ['spend-by-category', userId] })
  // El primer término de rpc_projected_balance es el saldo histórico completo (sin tope de fecha) —
  // cualquier alta/edición/borrado de un movimiento, en cualquier mes, lo mueve. Sin esto, el saldo
  // proyectado de Fijos/Créditos queda desactualizado hasta el próximo refetch por otra causa.
  queryClient.invalidateQueries({ queryKey: ['projected-balance', userId] })
}

export function useCreateTransaction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: input.type,
        amount: centsToNumeric(input.cents),
        occurred_on: input.occurredOn,
        category_id: input.categoryId,
        description: input.description,
        is_adjustment: input.isAdjustment ?? false,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUpdateTransaction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: TransactionInput & { id: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          type: input.type,
          amount: centsToNumeric(input.cents),
          occurred_on: input.occurredOn,
          category_id: input.categoryId,
          description: input.description,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useDeleteTransaction() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
