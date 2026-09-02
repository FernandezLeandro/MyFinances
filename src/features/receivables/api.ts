import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type ReceivableRowRaw = Database['public']['Tables']['receivables']['Row']
export interface Receivable extends Omit<ReceivableRowRaw, 'amount'> {
  /** Monto TOTAL de la deuda, no lo pendiente — lo pendiente sale de restarle los abonos en
   *  `aggregate.ts`, porque depende de otra tabla. */
  amountCents: number
}
function toReceivable(row: ReceivableRowRaw): Receivable {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

type ReceivablePaymentRowRaw = Database['public']['Tables']['receivable_payments']['Row']
export interface ReceivablePayment extends Omit<ReceivablePaymentRowRaw, 'amount'> {
  amountCents: number
}
function toReceivablePayment(row: ReceivablePaymentRowRaw): ReceivablePayment {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

/** Plata prestada, todavía sin cobrar del todo — pocas filas, se agregan en el cliente (ver
 *  `aggregate.ts`). No representa un movimiento por sí sola: eso depende de `already_expensed` y
 *  se resuelve recién al registrar un abono (`rpc_register_receivable_payment`). */
export function useReceivables() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['receivables', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('receivables').select('*').order('created_at')
      if (error) throw error
      return data.map(toReceivable)
    },
  })
}

/** Todos los abonos de todas las deudas del usuario — son pocas decenas de filas, y tanto /deudas
 *  como Cuadrar Saldo necesitan el set completo para calcular lo pendiente de cada una (ver
 *  `summarizeReceivables`). Un hook por deuda daría N queries en la lista. */
export function useReceivablePayments() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['receivable-payments', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivable_payments')
        .select('*')
        .order('occurred_on', { ascending: false })
      if (error) throw error
      return data.map(toReceivablePayment)
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------------------------

export interface ReceivableInput {
  name: string
  cents: number
  /** `'yyyy-MM-dd'`, día 1, o `null` para "no sé cuándo". */
  expectedPeriod: string | null
  alreadyExpensed: boolean
  note: string | null
}

/** Alta/edición/borrado de deudas: no toca `transactions` ni el saldo por sí sola — cargar que
 *  alguien te debe no es un movimiento (ver el comentario de la migración `receivables`). Sólo los
 *  abonos (abajo) pueden generar o borrar una transacción. */
function invalidarDeudas(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['receivables', userId] })
  queryClient.invalidateQueries({ queryKey: ['receivable-payments', userId] })
}

/** Registrar o quitar un abono SÍ puede crear/borrar una transacción real — pero sólo cuando la
 *  deuda tiene `already_expensed`, y el cliente no sabe de antemano si pasó (lo decide el RPC).
 *  Se invalida siempre: refetchear el saldo de más es barato, mostrarlo desactualizado no. Sin
 *  `projected-balance`: las deudas no entran al saldo proyectado (decisión explícita). */
function invalidarDeudasYPlata(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  invalidarDeudas(queryClient, userId)
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['monthly-summary', userId] })
  queryClient.invalidateQueries({ queryKey: ['spend-by-category', userId] })
}

export function useCreateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ReceivableInput) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('receivables')
        .insert({
          user_id: user.id,
          name: input.name,
          amount: centsToNumeric(input.cents),
          expected_period: input.expectedPeriod,
          already_expensed: input.alreadyExpensed,
          note: input.note,
        })
        .select()
        .single()
      if (error) throw error
      return toReceivable(data)
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
  })
}

export function useUpdateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ReceivableInput> & { id: string }) => {
      const patch: {
        name?: string
        amount?: string
        expected_period?: string | null
        already_expensed?: boolean
        note?: string | null
        updated_at: string
      } = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.cents !== undefined) patch.amount = centsToNumeric(input.cents)
      if (input.expectedPeriod !== undefined) patch.expected_period = input.expectedPeriod
      if (input.alreadyExpensed !== undefined) patch.already_expensed = input.alreadyExpensed
      if (input.note !== undefined) patch.note = input.note
      const { error } = await supabase.from('receivables').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
  })
}

export function useDeleteReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // `receivable_payments.receivable_id` es `on delete cascade` (borra el historial de abonos);
      // `transactions.id` referenciado por `receivable_payments.transaction_id` no se toca — los
      // movimientos ya registrados quedan.
      const { error } = await supabase.from('receivables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo eliminar la deuda. Probá de nuevo.' },
  })
}

export function useRegisterReceivablePayment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      receivableId,
      cents,
      occurredOn,
      categoryId,
    }: {
      receivableId: string
      cents: number
      occurredOn?: string
      categoryId?: string | null
    }) => {
      const { error } = await supabase.rpc('rpc_register_receivable_payment', {
        p_receivable_id: receivableId,
        p_amount: centsToNumeric(cents),
        p_occurred_on: occurredOn ?? null,
        p_category_id: categoryId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo registrar el abono. Probá de nuevo.' },
  })
}

export function useDeleteReceivablePayment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('rpc_delete_receivable_payment', { p_payment_id: paymentId })
      if (error) throw error
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo quitar el abono. Probá de nuevo.' },
  })
}
