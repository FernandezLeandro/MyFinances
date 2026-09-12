import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
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

/** Todo el historial de guardados de UN fijo, más reciente primero — mismo par que
 *  `useFixedExpensePaymentHistory`/`useFixedExpensePayments`. */
export function useFixedExpenseSavingHistory(fixedExpenseId: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['fixed-expense-savings', user?.id, 'history', fixedExpenseId],
    enabled: !!user && !!fixedExpenseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixed_expense_savings')
        .select('*')
        .eq('fixed_expense_id', fixedExpenseId!)
        .order('period', { ascending: false })
        .order('saved_at', { ascending: false })
      if (error) throw error
      return data.map(toSaving)
    },
  })
}

/** Sobre un rango arbitrario — la variante "horizonte, no ventana" del bloque 3 del plan de ciclos
 *  (ver `rpc_projected_balance_range` y el comentario de `projectionWindow` en `src/lib/cycle.ts`
 *  sobre por qué `from` no siempre es el inicio del ciclo que se está mirando). */
export function useProjectedBalanceRange(from: string, to: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['projected-balance-range', user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_projected_balance_range', { p_from: from, p_to: to })
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
    }) => {
      const { error } = await supabase.rpc('rpc_mark_fixed_expense_paid', {
        p_fixed_expense_id: fixedExpenseId,
        p_period: period,
        p_amount: centsToNumeric(cents),
        p_note: note ?? null,
        p_account_id: accountId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
    meta: { errorMessage: 'No se pudo marcar como pagado. Probá de nuevo.' },
  })
}

export function useUnmarkFixedExpensePayment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    // Por id de pago, no por (fijo, período): una bolsa puede tener varias filas en el mismo
    // período, así que "el pago de tal fijo en tal mes" ya no identifica una sola fila.
    mutationFn: async ({ paymentId }: { paymentId: string }) => {
      const { error } = await supabase.rpc('rpc_unmark_fixed_expense_payment', { p_payment_id: paymentId })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}

/** Registra que ya se guardó (parcial o total) plata para un fijo "una vez al mes" — a diferencia
 *  de `useMarkFixedExpensePaid`, inserta directo en la tabla (RLS de dueño alcanza: no hay
 *  movimiento ni plantilla que tocar, así que no hace falta un RPC). Varios guardados del mismo
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
    }: {
      fixedExpenseId: string
      period: string
      cents: number
      note?: string | null
    }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('fixed_expense_savings').insert({
        user_id: user.id,
        fixed_expense_id: fixedExpenseId,
        period,
        amount: centsToNumeric(cents),
        note: note ?? null,
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
    mutationFn: async ({ savingId }: { savingId: string }) => {
      const { error } = await supabase.from('fixed_expense_savings').delete().eq('id', savingId)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient, user?.id),
  })
}
