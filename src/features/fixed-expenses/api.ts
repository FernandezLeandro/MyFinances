import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import { localTodayISO } from '@/lib/dates'
import { isPgError, mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import type { Database } from '@/lib/database.types'

type FixedExpenseRowRaw = Database['public']['Tables']['fixed_expenses']['Row']
type PaymentRowRaw = Database['public']['Tables']['fixed_expense_payments']['Row']
type SavingRowRaw = Database['public']['Tables']['fixed_expense_savings']['Row']

export interface FixedExpense extends Omit<FixedExpenseRowRaw, 'amount'> {
  cents: number
}

export interface FixedExpensePayment extends Omit<PaymentRowRaw, 'amount_paid'> {
  amountPaidCents: number
}

/** Un guardado (Bloque 3): plata que el usuario ya apartó para un fijo "una vez al mes", sin que eso
 *  genere movimiento — no es un pago, es información sobre si ya juntó la plata o no. Ver
 *  `fixed_expense_savings` (`20260912030001_fixed_expense_savings.sql`). */
export interface FixedExpenseSaving extends Omit<SavingRowRaw, 'amount'> {
  amountCents: number
}

function toFixedExpense(row: FixedExpenseRowRaw): FixedExpense {
  const { amount, ...rest } = row
  return { ...rest, cents: centsFromNumeric(amount) }
}

function toPayment(row: PaymentRowRaw): FixedExpensePayment {
  const { amount_paid, ...rest } = row
  return { ...rest, amountPaidCents: centsFromNumeric(amount_paid) }
}

function toSaving(row: SavingRowRaw): FixedExpenseSaving {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

export function useFixedExpenses(includeInactive = false) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expenses', user?.id, includeInactive],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from('fixed_expenses').select('*').order('is_recurring', { ascending: false }).order('due_day')
      if (!includeInactive) query = query.eq('is_active', true)
      const { data, error } = await query
      if (error) throw error
      return data.map(toFixedExpense)
    },
  })
}

/** Pagos de uno o más períodos (día 1 del mes en `yyyy-MM-dd`): dice qué fijos ya están pagados.
 *  Casi siempre un solo período — mensual y quincenal nunca cruzan el mes; con ciclo semanal a
 *  caballo de dos meses (bloque 5 del plan de ciclos), `periods` trae los dos (`cycle.months`), o un
 *  fijo/bolsa con vencimiento o carga en el segundo mes quedaría invisible. */
export function useFixedExpensePayments(periods: string[]) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-payments', user?.id, periods],
    enabled: !!user && periods.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_expense_payments').select('*').in('period', periods)
      if (error) throw error
      return data.map(toPayment)
    },
  })
}

/** Todo el historial de pagos de UN fijo, más reciente primero — a diferencia de
 *  `useFixedExpensePayments`, que trae los de TODOS los fijos pero de un solo período. */
export function useFixedExpensePaymentHistory(fixedExpenseId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-payments', user?.id, 'history', fixedExpenseId],
    enabled: !!user && !!fixedExpenseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_expense_payments')
        .select('*')
        .eq('fixed_expense_id', fixedExpenseId!)
        .order('period', { ascending: false })
        // Orden secundario: una bolsa puede tener varias cargas en el mismo período, y sin esto
        // quedarían en el orden que Postgres devuelva, que no es necesariamente el de pago.
        .order('paid_at', { ascending: false })
      if (error) throw error
      return data.map(toPayment)
    },
  })
}

/** Guardados de uno o más períodos, de TODOS los fijos — mismo criterio multi-período que
 *  `useFixedExpensePayments` (semanal puede tocar dos meses). */
export function useFixedExpenseSavings(periods: string[]) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-savings', user?.id, periods],
    enabled: !!user && periods.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('fixed_expense_savings').select('*').in('period', periods)
      if (error) throw error
      return data.map(toSaving)
    },
  })
}

/** El guardado (si existe) cuyo movimiento es `transactionId` — para que `TransactionFormDialog`
 *  sepa si el movimiento que está editando es un guardado vinculado a un fijo (Bloque 1 del QA de
 *  Fijos: FI-02/FI-03, mismo criterio que ya usa para un pago con `transaction.fixed_expense_payment_id`,
 *  que no necesita query aparte). Un movimiento nunca es a la vez pago y guardado, así que alcanza
 *  con esta única fila en vez de traer todos los guardados del período. */
export function useFixedExpenseSavingByTransaction(transactionId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-saving-by-transaction', user?.id, transactionId],
    enabled: !!user && !!transactionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_expense_savings')
        .select('*')
        .eq('transaction_id', transactionId!)
        .maybeSingle()
      if (error) throw error
      return data ? toSaving(data) : null
    },
  })
}

/** Sobre un rango arbitrario — la variante "horizonte, no ventana" del bloque 3 del plan de ciclos
 *  (ver `rpc_projected_balance_range` y el comentario de `projectionWindow` en `src/lib/cycle.ts`
 *  sobre por qué `from` no siempre es el inicio del ciclo que se está mirando). */
export function useProjectedBalanceRange(from: string, to: string) {
  const { user } = useAuth()
  // "Hoy" lo manda el cliente: `current_date` de la base es UTC y, pasadas las 21:00 en Argentina,
  // ya es mañana (ver la migración `hoy_del_cliente`). En la key para que cambie de día sola.
  const today = localTodayISO()

  return useQuery({
    queryKey: ['projected-balance-range', user?.id, from, to, today],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_projected_balance_range', { p_from: from, p_to: to, p_today: today })
      if (error) throw error
      return centsFromNumeric(String(data ?? 0))
    },
  })
}

export interface FixedExpenseInput {
  name: string
  cents: number
  categoryId: string | null
  /** `null` en recurrentes: una bolsa no vence, así que no tiene sentido pedir un día. */
  dueDay: number | null
  isActive: boolean
  /** Bolsa: `cents` pasa a ser el presupuesto del período (`bagFrequency`), y se puede marcar
   *  varias veces (ver `useMarkFixedExpensePaid`/`aggregate.ts`) en vez de una sola. */
  isRecurring: boolean
  /** Sólo bolsas: cada cuánto resetea el presupuesto — independiente del ciclo de caja de la
   *  cuenta (`profiles.cycle_kind`, ver `src/lib/cycle.ts`). Ignorado si `!isRecurring`. */
  bagFrequency: 'monthly' | 'biweekly' | 'weekly'
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['fixed-expenses', userId] })
  queryClient.invalidateQueries({ queryKey: ['fixed-expense-payments', userId] })
  // Guardados (bloque 3): no mueven el saldo proyectado ni generan movimiento, pero si esta función
  // se llama por crear/editar/borrar un fijo (no sólo por pagar/desmarcar) igual conviene refrescarlos
  // — invalidar de más acá es gratis, y evita un guardado "fantasma" de un fijo recién borrado.
  queryClient.invalidateQueries({ queryKey: ['fixed-expense-savings', userId] })
  // `projected-balance-range` (bloque 3): la variante que de verdad usan Hoy/Fijos/Mis Deudas desde
  // que existe — sin esto, el headline "Saldo proyectado" quedaba desactualizado después de crear,
  // pagar o borrar un fijo/bolsa, hasta recargar la página (bug encontrado al verificar el bloque 5
  // contra la cuenta de prueba real, preexistente desde que se agregó la query por rango).
  queryClient.invalidateQueries({ queryKey: ['projected-balance-range', userId] })
  queryClient.invalidateQueries({ queryKey: ['transactions', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['monthly-summary', userId] })
  queryClient.invalidateQueries({ queryKey: ['spend-by-category', userId] })
  queryClient.invalidateQueries({ queryKey: ['account-balances', userId] })
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
        is_recurring: input.isRecurring,
        bag_frequency: input.bagFrequency,
        // Explícito: el `default current_date` de la columna es UTC, y un fijo creado el último día
        // del mes después de las 21:00 arrancaba el mes siguiente — no aparecía en el actual.
        starts_on: localTodayISO(),
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
          is_recurring: input.isRecurring,
          bag_frequency: input.bagFrequency,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

export function useDeleteFixedExpense() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // `fixed_expense_payments.fixed_expense_id` es `on delete cascade` (borra el historial) y
      // `transactions.fixed_expense_payment_id` es `on delete set null` (los movimientos quedan).
      const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo eliminar el gasto fijo. Probá de nuevo.' },
  })
}

export function useMarkFixedExpensePaid() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fixedExpenseId,
      period,
      cents,
      note,
      accountId,
      occurredOn,
    }: {
      fixedExpenseId: string
      period: string
      /** Importe realmente pagado — puede diferir del importe de la plantilla (aumentos, ajustes).
       *  El RPC decide solo si con esto actualiza la plantilla (sólo mes en curso o futuro). */
      cents: number
      /** Sólo bolsas: detalle de esta carga puntual ("Chino del barrio"). Pasa a ser la descripción
       *  del movimiento en vez del nombre del fijo — sin esto, todas las cargas de una bolsa se ven
       *  igual en /movimientos. */
      note?: string | null
      /** Con qué se pagó — ver `p_account_id` en la migración `cuentas_en_pagos`. */
      accountId?: string | null
      /** Fecha real del pago (`yyyy-MM-dd`) — `undefined`/`null` es "hoy", igual que antes de esta
       *  fecha elegible. Ver la migración `fixed_expense_payment_fecha`. */
      occurredOn?: string | null
    }) => {
      const { error } = await supabase.rpc('rpc_mark_fixed_expense_paid', {
        p_fixed_expense_id: fixedExpenseId,
        p_period: period,
        p_amount: centsToNumeric(cents),
        p_note: note ?? null,
        p_account_id: accountId ?? null,
        p_occurred_on: occurredOn ?? null,
        p_today: localTodayISO(),
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo marcar como pagado. Probá de nuevo.' },
  })
}

/** `force`: sin él, la base rechaza (`payment_before_accounts`) quitar un pago cuyo movimiento es
 *  anterior a la primera cuenta del usuario — esa plata ya está descontada de la apertura, y
 *  volver a pagarlo la resta dos veces. Usar directo sólo cuando ya se confirmó con el usuario (ver
 *  `useUnmarkWithLegacyConfirm`, que es lo que llaman las pantallas). */
export function useUnmarkFixedExpensePayment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    // Por id de pago, no por (fijo, período): una bolsa puede tener varias filas en el mismo
    // período, así que "el pago de tal fijo en tal mes" ya no identifica una sola fila.
    mutationFn: async ({ paymentId, force = false }: { paymentId: string; force?: boolean }) => {
      const { error } = await supabase.rpc('rpc_unmark_fixed_expense_payment', { p_payment_id: paymentId, p_force: force })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

/** Envuelve `useUnmarkFixedExpensePayment` para manejar el freno `payment_before_accounts`: si la
 *  base lo rechaza, abre un diálogo de confirmación (`UnmarkBeforeAccountsDialog`) en vez de mostrar
 *  el toast genérico; cualquier otro error sí se avisa con toast. Una sola fuente para los cuatro
 *  lugares que pueden desmarcar un pago o borrar su movimiento (Fijos, el detalle del fijo,
 *  Movimientos en Básico, y el botón Eliminar de `TransactionFormDialog` — N4 del QA: antes ese
 *  último borraba el movimiento con un toque, sin pasar por este freno).
 *
 *  `onSuccess` es opcional: lo usa `TransactionFormDialog` para cerrarse a sí mismo — los demás
 *  llamadores no tienen un diálogo propio que cerrar. */
export function useUnmarkWithLegacyConfirm(options: { onSuccess?: () => void } = {}) {
  const unmark = useUnmarkFixedExpensePayment()
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null)

  function unmarkPayment(paymentId: string) {
    unmark.mutate(
      { paymentId },
      {
        onSuccess: options.onSuccess,
        onError: (error) => {
          if (isPgError(error, 'payment_before_accounts')) setPendingPaymentId(paymentId)
          else showToast('No se pudo quitar el pago', 'error', { detail: mensajeDeError(error) })
        },
      },
    )
  }

  function confirmForce() {
    if (!pendingPaymentId) return
    unmark.mutate(
      { paymentId: pendingPaymentId, force: true },
      { onSuccess: options.onSuccess, onError: (error) => showToast('No se pudo quitar el pago', 'error', { detail: mensajeDeError(error) }) },
    )
    setPendingPaymentId(null)
  }

  return {
    unmarkPayment,
    isPending: unmark.isPending,
    confirmOpen: pendingPaymentId !== null,
    confirmForce,
    cancelConfirm: () => setPendingPaymentId(null),
  }
}

/** Registra que ya se guardó (parcial o total) plata para un fijo "una vez al mes" — a diferencia
 *  de la primera versión (Bloque 3), ahora puede generar un movimiento real (`generateMovement`,
 *  opcional): con eso hacen falta dos escrituras atómicas (transacción + guardado), así que pasó a
 *  RPC (`rpc_add_fixed_expense_saving`) en vez de un insert directo. Varios guardados del mismo
 *  período se acumulan, igual que las cargas de una bolsa. */
export function useAddFixedExpenseSaving() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      fixedExpenseId,
      period,
      cents,
      note,
      generateMovement = false,
      accountId,
      occurredOn,
    }: {
      fixedExpenseId: string
      period: string
      cents: number
      note?: string | null
      /** Sólo tiene sentido con `movimientos-manuales` (Premium/etc) — BASIC siempre manda `false`:
       *  ver el guard en `MarkPaidDialog`. Con `true`, esta plata sale del saldo real ahora, y
       *  `rpc_mark_fixed_expense_paid` la descuenta del movimiento que genera el pago. */
      generateMovement?: boolean
      /** Con qué se guardó — sólo aplica si `generateMovement`. */
      accountId?: string | null
      /** Fecha real del movimiento generado — sólo importa si `generateMovement`. `undefined`/`null`
       *  es "hoy". Ver la migración `fixed_expense_payment_fecha`. */
      occurredOn?: string | null
    }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.rpc('rpc_add_fixed_expense_saving', {
        p_fixed_expense_id: fixedExpenseId,
        p_period: period,
        p_amount: centsToNumeric(cents),
        p_generate_movement: generateMovement,
        p_note: note ?? null,
        p_account_id: accountId ?? null,
        p_occurred_on: occurredOn ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo registrar el guardado. Probá de nuevo.' },
  })
}

export function useRemoveFixedExpenseSaving() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    // RPC en vez de delete directo (Bloque 3 usaba delete): si el guardado generó un movimiento hay
    // que borrar también la transacción, y si el fijo ya está pagado en ese período hay que impedirlo
    // — el pago pudo haberse calculado restando este guardado (ver `rpc_remove_fixed_expense_saving`).
    mutationFn: async ({ savingId }: { savingId: string }) => {
      const { error } = await supabase.rpc('rpc_remove_fixed_expense_saving', { p_saving_id: savingId })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo quitar el guardado. Si el fijo ya está pagado, desmarcá el pago primero.' },
  })
}
