import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type CreditCardRow = Database['public']['Tables']['credit_cards']['Row']
// Sin numeric — a diferencia de las otras 4, una tarjeta no tiene ningún importe propio.
export type CreditCard = CreditCardRow

type CreditPurchaseRowRaw = Database['public']['Tables']['credit_purchases']['Row']
export interface CreditPurchase extends Omit<CreditPurchaseRowRaw, 'installment_amount'> {
  installmentAmountCents: number
}
function toCreditPurchase(row: CreditPurchaseRowRaw): CreditPurchase {
  const { installment_amount, ...rest } = row
  return { ...rest, installmentAmountCents: centsFromNumeric(installment_amount) }
}

type CreditCardSavingRowRaw = Database['public']['Tables']['credit_card_savings']['Row']
export interface CreditCardSaving extends Omit<CreditCardSavingRowRaw, 'amount'> {
  amountCents: number
}
function toCreditCardSaving(row: CreditCardSavingRowRaw): CreditCardSaving {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

type CreditCardPaymentRowRaw = Database['public']['Tables']['credit_card_payments']['Row']
export interface CreditCardPayment extends Omit<CreditCardPaymentRowRaw, 'amount_paid'> {
  amountPaidCents: number
}
function toCreditCardPayment(row: CreditCardPaymentRowRaw): CreditCardPayment {
  const { amount_paid, ...rest } = row
  return { ...rest, amountPaidCents: centsFromNumeric(amount_paid) }
}

type CreditCardPaymentItemRowRaw = Database['public']['Tables']['credit_card_payment_items']['Row']
export interface CreditCardPaymentItem extends Omit<CreditCardPaymentItemRowRaw, 'amount'> {
  amountCents: number
}
function toCreditCardPaymentItem(row: CreditCardPaymentItemRowRaw): CreditCardPaymentItem {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

/** Fila de `v_credit_installments`: qué cuota de qué compra cae en un período dado. */
type CreditInstallmentRaw = Database['public']['Functions']['v_credit_installments']['Returns'][number]
export interface CreditInstallment extends Omit<CreditInstallmentRaw, 'amount'> {
  amountCents: number
}
function toCreditInstallment(row: CreditInstallmentRaw): CreditInstallment {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export function useCreditCards() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-cards', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('*').order('due_day')
      if (error) throw error
      return data
    },
  })
}

/** Qué cuota de qué compra cae en `period` (`'yyyy-MM-dd'`, día 1) — la única fuente de verdad,
 *  la misma que usa `rpc_projected_balance` y `rpc_mark_credit_card_paid` del lado del servidor. */
export function useCreditInstallments(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-installments', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('v_credit_installments', { p_period: period })
      if (error) throw error
      return (data ?? []).map(toCreditInstallment)
    },
  })
}

/** Lo guardado de cada tarjeta para `period` — un monto por tarjeta y mes, no un historial. */
export function useCreditCardSavings(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-savings', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_card_savings').select('*').eq('period', period)
      if (error) throw error
      return data.map(toCreditCardSaving)
    },
  })
}

/** Qué tarjetas ya están pagadas en `period` — la existencia de la fila ES el estado "pagada". */
export function useCreditCardPayments(period: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-payments', user?.id, period],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_card_payments').select('*').eq('period', period)
      if (error) throw error
      return data.map(toCreditCardPayment)
    },
  })
}

/** Todas las compras de una tarjeta (no acotadas a un período) — para el detalle de una tarjeta. */
export function useCreditPurchases(cardId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-purchases', user?.id, cardId],
    enabled: !!user && !!cardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_purchases')
        .select('*')
        .eq('card_id', cardId!)
        .order('first_period', { ascending: false })
      if (error) throw error
      return data.map(toCreditPurchase)
    },
  })
}

/** Snapshot de lo que se abonó en un pago ya cerrado — sobrevive aunque la compra original se
 *  edite o se borre después (ver `credit_card_payment_items` en la migración). */
export function useCreditCardPaymentItems(paymentId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['credit-payment-items', user?.id, paymentId],
    enabled: !!user && !!paymentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_card_payment_items')
        .select('*')
        .eq('payment_id', paymentId!)
        .order('amount', { ascending: false })
      if (error) throw error
      return data.map(toCreditCardPaymentItem)
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------------------------

/** Alta/edición/borrado de tarjetas y compras: cambia lo que se debe, no la plata que ya salió.
 *  Deliberadamente NO invalida transactions/balance/monthly-summary/spend-by-category — cargar
 *  una compra es la acción más frecuente de la feature, no hace falta refetchear el donut. */
function invalidarCreditos(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['credit-cards', userId] })
  queryClient.invalidateQueries({ queryKey: ['credit-purchases', userId] })
  queryClient.invalidateQueries({ queryKey: ['credit-installments', userId] })
  queryClient.invalidateQueries({ queryKey: ['credit-savings', userId] })
  queryClient.invalidateQueries({ queryKey: ['credit-payments', userId] })
  queryClient.invalidateQueries({ queryKey: ['projected-balance', userId] })
}

/** Marcar/desmarcar pagada, además, crea o borra una transacción real. */
function invalidarCreditosYPlata(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  invalidarCreditos(queryClient, userId)
  queryClient.invalidateQueries({ queryKey: ['credit-payment-items', userId] })
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['monthly-summary', userId] })
  queryClient.invalidateQueries({ queryKey: ['spend-by-category', userId] })
}

export interface CreditCardInput {
  name: string
  dueDay: number
}

export function useCreateCreditCard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreditCardInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('credit_cards').insert({
        user_id: user.id,
        name: input.name,
        due_day: input.dueDay,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

export function useUpdateCreditCard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: CreditCardInput & { id: string }) => {
      const { error } = await supabase.from('credit_cards').update({ name: input.name, due_day: input.dueDay }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

/** Cascada de RLS/FK: borra sus compras, lo guardado y sus pagos. Las transacciones YA generadas
 *  no se tocan (`credit_card_payment_items.transaction_id` es `on delete set null`). */
export function useDeleteCreditCard() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('credit_cards').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

export interface PurchaseInput {
  cardId: string
  description: string
  installmentCents: number
  installments: number
  firstPeriod: string
  categoryId: string | null
}

export function useCreatePurchase() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: PurchaseInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('credit_purchases').insert({
        user_id: user.id,
        card_id: input.cardId,
        description: input.description,
        installment_amount: centsToNumeric(input.installmentCents),
        installments: input.installments,
        first_period: input.firstPeriod,
        category_id: input.categoryId,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

export function useUpdatePurchase() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Omit<PurchaseInput, 'cardId'> & { id: string }) => {
      const { error } = await supabase
        .from('credit_purchases')
        .update({
          description: input.description,
          installment_amount: centsToNumeric(input.installmentCents),
          installments: input.installments,
          first_period: input.firstPeriod,
          category_id: input.categoryId,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

export function useDeletePurchase() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('credit_purchases').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

/** Upsert: un monto por tarjeta y período, se pisa — no se acumula un historial de aportes. */
export function useSetCreditCardSaving() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ cardId, period, cents }: { cardId: string; period: string; cents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('credit_card_savings').upsert(
        { user_id: user.id, card_id: cardId, period, amount: centsToNumeric(cents), updated_at: new Date().toISOString() },
        { onConflict: 'card_id,period' },
      )
      if (error) throw error
    },
    onSuccess: () => invalidarCreditos(queryClient, user?.id),
  })
}

/** Sin importe ni categoría manuales: el RPC arma un movimiento POR CATEGORÍA presente ese mes,
 *  agrupando las cuotas que la comparten (ver la migración) — no hay un solo total ni una sola
 *  categoría que este mutation pueda sobreescribir. */
export function useMarkCreditCardPaid() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ cardId, period }: { cardId: string; period: string }) => {
      const { error } = await supabase.rpc('rpc_mark_credit_card_paid', { p_card_id: cardId, p_period: period })
      if (error) throw error
    },
    onSuccess: () => invalidarCreditosYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo marcar la tarjeta como pagada. Probá de nuevo.' },
  })
}

export function useUnmarkCreditCardPaid() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ cardId, period }: { cardId: string; period: string }) => {
      const { error } = await supabase.rpc('rpc_unmark_credit_card_paid', { p_card_id: cardId, p_period: period })
      if (error) throw error
    },
    onSuccess: () => invalidarCreditosYPlata(queryClient, user?.id),
  })
}
