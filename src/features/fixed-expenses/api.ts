import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type FixedExpenseRowRaw = Database['public']['Tables']['fixed_expenses']['Row']
type PaymentRowRaw = Database['public']['Tables']['fixed_expense_payments']['Row']

export interface FixedExpense extends Omit<FixedExpenseRowRaw, 'amount'> {
  cents: number
}

export interface FixedExpensePayment extends Omit<PaymentRowRaw, 'amount_paid'> {
  amountPaidCents: number
}

function toFixedExpense(row: FixedExpenseRowRaw): FixedExpense {
  const { amount, ...rest } = row
  return { ...rest, cents: centsFromNumeric(amount) }
}

function toPayment(row: PaymentRowRaw): FixedExpensePayment {
  const { amount_paid, ...rest } = row
  return { ...rest, amountPaidCents: centsFromNumeric(amount_paid) }
}

export function useFixedExpenses(includeInactive = false) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expenses', user?.id, includeInactive],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from('fixed_expenses').select('*').order('due_day')
      if (!includeInactive) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) throw error
      return data.map(toFixedExpense)
    },
  })
}

/** Pagos de un período (día 1 del mes en `yyyy-MM-dd`): dice qué fijos ya están pagados. */
export function useFixedExpensePayments(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-payments', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_expense_payments').select('*').eq('period', period)
      if (error) throw error
      return data.map(toPayment)
    },
  })
}

export function useProjectedBalance(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['projected-balance', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_projected_balance', { p_period: period })
      if (error) throw error
      return centsFromNumeric(String(data ?? 0))
    },
  })
}

export interface FixedExpenseInput {
  name: string
  cents: number
  categoryId: string | null
  dueDay: number
  isActive: boolean
  endsOn: string | null
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['fixed-expenses', userId] })
  queryClient.invalidateQueries({ queryKey: ['fixed-expense-payments', userId] })
  queryClient.invalidateQueries({ queryKey: ['projected-balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['monthly-summary', userId] })
  queryClient.invalidateQueries({ queryKey: ['spend-by-category', userId] })
}

export function useCreateFixedExpense() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: FixedExpenseInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('fixed_expenses').insert({
        user_id: user.id,
        name: input.name,
        amount: centsToNumeric(input.cents),
        category_id: input.categoryId,
        due_day: input.dueDay,
        is_active: input.isActive,
        ends_on: input.endsOn,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUpdateFixedExpense() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: FixedExpenseInput & { id: string }) => {
      const { error } = await supabase
        .from('fixed_expenses')
        .update({
          name: input.name,
          amount: centsToNumeric(input.cents),
          category_id: input.categoryId,
          due_day: input.dueDay,
          is_active: input.isActive,
          ends_on: input.endsOn,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useMarkFixedExpensePaid() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fixedExpenseId, period }: { fixedExpenseId: string; period: string }) => {
      const { error } = await supabase.rpc('rpc_mark_fixed_expense_paid', {
        p_fixed_expense_id: fixedExpenseId,
        p_period: period,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useUnmarkFixedExpensePaid() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fixedExpenseId, period }: { fixedExpenseId: string; period: string }) => {
      const { error } = await supabase.rpc('rpc_unmark_fixed_expense_paid', {
        p_fixed_expense_id: fixedExpenseId,
        p_period: period,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
