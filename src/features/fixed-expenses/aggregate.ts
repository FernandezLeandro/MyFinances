import { endOfMonth, format, startOfMonth } from 'date-fns'
import type { Cycle } from '@/lib/cycle'
import type { FixedExpense, FixedExpensePayment } from './api'
import { eligibleFixedExpenses, fijoCaeEnCiclo } from './period'

/**
 * Función pura, separada de la red a propósito — mismo criterio que `credits/aggregate.ts`: se
 * verifica con números a mano sin levantar la app. Reproduce EXACTAMENTE
 * la lógica del segundo término de `rpc_projected_balance` (ver la migración
 * `20260814020001_projected_balance_con_bolsas.sql`) para que el número grande del panel y el
 * desglose de esta pantalla nunca se desincronicen. `today` entra por parámetro, no `new Date()`
 * adentro, para poder testearlo — mismo criterio que `permiteActualizarPlantilla` en `period.ts`.
 */

export interface FixedExpenseStatus {
  fe: FixedExpense
  /** Pagos de `fe` en este período, más reciente primero. Un fijo de una sola vez tiene 0 ó 1; una
   *  bolsa puede tener varios. */
  payments: FixedExpensePayment[]
  /** Suma de `payments` — para un fijo de una sola vez, 0 ó `fe.cents`. */
  paidCents: number
  /** Lo que el saldo proyectado descuenta por este fijo. Fijo de una sola vez: `fe.cents` si no hay
   *  pago, si no 0. Bolsa: lo que falta del presupuesto, nunca negativo — y 0 si el período ya
   *  cerró (un presupuesto no gastado de un mes pasado no se debe, a diferencia de una obligación
   *  real impaga). */
  remainingCents: number
  /** Ya no requiere acción esta pantalla: un fijo de una sola vez con pago, o una bolsa que llegó al
   *  presupuesto o cuyo período ya cerró (con `remainingCents` en 0 no queda nada por completar). */
  done: boolean
  /** Sólo bolsas: cuánto se pasó del presupuesto. 0 si no es bolsa o no se excedió. */
  overspentCents: number
}

function statusFor(fe: FixedExpense, payments: FixedExpensePayment[], period: Date, today: Date): FixedExpenseStatus {
  const fePayments = payments
    .filter((p) => p.fixed_expense_id === fe.id)
    .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
  const paidCents = fePayments.reduce((acc, p) => acc + p.amountPaidCents, 0)

  if (!fe.is_recurring) {
    const done = fePayments.length > 0
    return { fe, payments: fePayments, paidCents, remainingCents: done ? 0 : fe.cents, done, overspentCents: 0 }
  }

  const periodClosed = startOfMonth(period) < startOfMonth(today)
  const remainingCents = periodClosed ? 0 : Math.max(fe.cents - paidCents, 0)
  const overspentCents = Math.max(paidCents - fe.cents, 0)
  const done = remainingCents === 0

  return { fe, payments: fePayments, paidCents, remainingCents, done, overspentCents }
}

export type FixedExpenseUrgency = 'red' | 'amber' | 'neutral'

/**
 * Rojo si ya venció este mes, ámbar si vence en los próximos 7 días (hoy incluido), neutro más
 * adelante. Sólo tiene sentido para un fijo de una sola vez — una bolsa mensual no "vence", así que
 * no tiene `due_day` y no pasa por acá. Compartida por el widget de Vencimientos de Hoy y los tres
 * grupos de Fijos (Atrasado / Esta semana / Más adelante).
 */
export function fixedExpenseUrgency(dueDay: number, today: Date): FixedExpenseUrgency {
  const diff = dueDay - today.getDate()
  if (diff < 0) return 'red'
  if (diff <= 6) return 'amber'
  return 'neutral'
}

/** Recurrentes primero (no tienen vencimiento: son una bolsa que se va llenando todo el mes, no una
 *  fecha que llega), después los de una sola vez por día de vencimiento. Entre recurrentes, alfabético
 *  — sin `due_day` no hay criterio natural y el orden de la query no es determinístico. Es el orden
 *  efectivo de toda la pantalla de Fijos (pendientes, pagados y pausados usan este comparador). */
export function compareFixedExpenses(a: FixedExpense, b: FixedExpense): number {
  if (a.is_recurring !== b.is_recurring) return a.is_recurring ? -1 : 1
  if (a.is_recurring) return a.name.localeCompare(b.name, 'es')
  return (a.due_day ?? 32) - (b.due_day ?? 32)
}

export interface FixedExpensesSummary {
  pending: FixedExpenseStatus[]
  done: FixedExpenseStatus[]
  /** Igual a lo que resta el segundo término de `rpc_projected_balance` para este período: la suma
   *  de `remainingCents` de TODOS los fijos activos elegibles, pagados o no (un fijo saldado ya
   *  aporta 0). */
  pendingTotalCents: number
}

/**
 * `period` es cualquier fecha dentro del mes a resumir (como `month` en Fijos.tsx / Hoy.tsx);
 * `payments` son los pagos YA filtrados a ese período (lo que devuelve `useFixedExpensePayments`).
 *
 * `window` es opcional y nuevo (bloque 3 del plan de ciclos): cuando se pasa, además del filtro de
 * vigencia de siempre se aplica `fijoCaeEnCiclo` — un fijo de una sola vez sólo cuenta si su
 * vencimiento cae dentro de esa ventana, no en cualquier punto del mes. Sin `window` (ningún
 * consumidor lo pasaba antes de este bloque) el comportamiento es IDÉNTICO al de siempre — y aunque
 * se pase, con una ventana = el mes calendario completo el filtro es un no-op (ver
 * `fijoCaeEnCiclo`), así que un usuario en ciclo mensual tampoco nota cambio.
 *
 * `window` no es necesariamente el ciclo que se está mirando: en una pantalla que navega, tiene que
 * ser el HORIZONTE (`projectionWindow` en `src/lib/cycle.ts`) para que este desglose coincida exacto
 * con lo que descuenta `rpc_projected_balance_range` — pasar el ciclo a secas ahí desincroniza el
 * panel del número grande en silencio (riesgo #1 del plan).
 */
export function summarizeFixedExpenses(
  expenses: FixedExpense[],
  payments: FixedExpensePayment[],
  period: Date,
  today: Date,
  window?: Pick<Cycle, 'from' | 'to'>,
): FixedExpensesSummary {
  const monthStart = format(startOfMonth(period), 'yyyy-MM-dd')
  const eligible = eligibleFixedExpenses(expenses, startOfMonth(period), endOfMonth(period))
    .filter((fe) => fe.is_active)
    .filter((fe) => !window || fijoCaeEnCiclo(fe, monthStart, window))
  const statuses = eligible
    .map((fe) => statusFor(fe, payments, period, today))
    .sort((a, b) => compareFixedExpenses(a.fe, b.fe))

  return {
    pending: statuses.filter((s) => !s.done),
    done: statuses.filter((s) => s.done),
    pendingTotalCents: statuses.reduce((acc, s) => acc + s.remainingCents, 0),
  }
}
