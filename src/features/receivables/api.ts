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

/** Todos los abonos de todas las deudas del usuario — son pocas decenas de filas, y tanto /me-deben
 *  como el reajuste de una cuenta necesitan el set completo para calcular lo pendiente de cada una (ver
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
  /** El TOTAL prestado — la cuota se deriva en `aggregate.ts` (`cuotaCents`). */
  cents: number
  /** Mes de la primera cuota, `'yyyy-MM-dd'` día 1, o `null` para "no sé cuándo" (sólo con 1 cuota). */
  expectedPeriod: string | null
  installments: number
  note: string | null
}

/** Editar/borrar una deuda no toca `transactions` ni el saldo por sí sola — sólo el ALTA puede
 *  (cuando trae `expense`), y los abonos y el descuento (abajo). */
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
  queryClient.invalidateQueries({ queryKey: ['account-balances', userId] })
}

/** Alta de deuda, vía RPC porque puede tener que crear el gasto asociado atómicamente — dos
 *  escrituras sueltas desde el cliente podrían cortarse a la mitad (PWA) y dejar un gasto huérfano.
 *  `expense` = registrar el gasto por el total, en la categoría «Préstamos» (la resuelve el RPC) y
 *  con fecha de hoy; `accountId` es con qué se pagó. */
export function useCreateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ expense, ...input }: ReceivableInput & { expense: { accountId: string | null } | null }) => {
      const { data, error } = await supabase.rpc('rpc_create_receivable', {
        p_name: input.name,
        p_amount: centsToNumeric(input.cents),
        p_expected_period: input.expectedPeriod,
        p_note: input.note,
        p_already_expensed: expense != null,
        p_expense_amount: expense ? centsToNumeric(input.cents) : null,
        p_account_id: expense?.accountId ?? null,
        p_installments: input.installments,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo guardar la deuda. Probá de nuevo.' },
  })
}

export function useUpdateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ReceivableInput> & { id: string }) => {
      // Sin `already_expensed`: si la deuda generó un gasto o no se decide al prestar (o con
      // "Registrar el gasto ahora" / "Deshacer" del detalle, que pasan por RPC) — tocarlo con un
      // update suelto dejaría un gasto huérfano o contado dos veces.
      const patch: {
        name?: string
        amount?: string
        expected_period?: string | null
        installments?: number
        note?: string | null
        updated_at: string
      } = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.cents !== undefined) patch.amount = centsToNumeric(input.cents)
      if (input.expectedPeriod !== undefined) patch.expected_period = input.expectedPeriod
      if (input.installments !== undefined) patch.installments = input.installments
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
      createIncome,
      accountId,
    }: {
      receivableId: string
      cents: number
      occurredOn?: string
      /** `null`/`undefined` deja que el RPC derive de `already_expensed`; `true`/`false` explícito
       *  pisa esa derivación — ver el checkbox de la vista "Cobrar" de `ReceivableSheet`. El ingreso
       *  cae en «Préstamos» (lo resuelve el RPC). */
      createIncome?: boolean | null
      /** Dónde ENTRÓ la plata cobrada — sólo tiene efecto si el abono termina generando un ingreso. */
      accountId?: string | null
    }) => {
      const { error } = await supabase.rpc('rpc_register_receivable_payment', {
        p_receivable_id: receivableId,
        p_amount: centsToNumeric(cents),
        p_occurred_on: occurredOn ?? null,
        p_create_income: createIncome ?? null,
        p_account_id: accountId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo registrar el abono. Probá de nuevo.' },
  })
}

/** "Registrar el gasto ahora" sobre una deuda cargada sin movimiento: genera el gasto que faltaba
 *  por lo pendiente (en «Préstamos», con fecha de hoy) y prende `already_expensed`. Ver
 *  `rpc_expense_receivable`. */
export function useExpenseReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ receivableId, accountId }: { receivableId: string; accountId?: string | null }) => {
      const { error } = await supabase.rpc('rpc_expense_receivable', {
        p_receivable_id: receivableId,
        p_account_id: accountId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo registrar el gasto. Probá de nuevo.' },
  })
}

/** Revert de `useExpenseReceivable`. El RPC se niega si ya hubo un abono que generó un ingreso. */
export function useUnexpenseReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (receivableId: string) => {
      const { error } = await supabase.rpc('rpc_unexpense_receivable', { p_receivable_id: receivableId })
      if (error) throw error
    },
    onSuccess: () => invalidarDeudasYPlata(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo deshacer el gasto. Probá de nuevo.' },
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
