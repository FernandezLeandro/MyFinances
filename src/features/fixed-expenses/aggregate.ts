import { differenceInCalendarDays, format, startOfMonth } from 'date-fns'
import { cycleContaining, type Cycle } from '@/lib/cycle'
import type { FixedExpense, FixedExpensePayment } from './api'
import { cycleMonthsBounds, dueDateInCycle, eligibleFixedExpenses, fijoCaeEnCicloMultiMes } from './period'

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
  /** Vencimiento materializado (`'yyyy-MM-dd'`), sólo para un fijo de una sola vez — `null` en una
   *  bolsa. Para `fixedExpenseUrgency`, que necesita la fecha real (bloque 5 del plan: con un ciclo
   *  semanal a caballo de dos meses, el día del mes solo no alcanza para saber si ya venció). */
  dueDate: string | null
}

function statusFor(
  fe: FixedExpense,
  payments: FixedExpensePayment[],
  period: Date,
  today: Date,
  dueDate: string | null,
  weekStartsOn: number,
): FixedExpenseStatus {
  const fePayments = payments
    .filter((p) => p.fixed_expense_id === fe.id)
    .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))

  if (!fe.is_recurring) {
    const paidCents = fePayments.reduce((acc, p) => acc + p.amountPaidCents, 0)
    const done = fePayments.length > 0
    return { fe, payments: fePayments, paidCents, remainingCents: done ? 0 : fe.cents, done, overspentCents: 0, dueDate }
  }

  const periodClosed = startOfMonth(period) < startOfMonth(today)
  const isCurrentMonth = !periodClosed && startOfMonth(period).getTime() === startOfMonth(today).getTime()

  // Bolsa quincenal/semanal "en vivo" (bloques 4 y 5 del plan): mientras se mira el mes EN CURSO,
  // sólo cuenta lo cargado en el sub-período que contiene HOY (la quincena o la semana vigente,
  // nunca más de una) para que el remanente sea el de ese sub-período, no el de todo el mes. Mes
  // cerrado (0, más abajo) y mes futuro (presupuesto completo, sin pagos todavía) se comportan igual
  // que una bolsa mensual: no hay "sub-período futuro" hasta que llegue. Espejo exacto de
  // `bag_cycle_from`/`bag_cycle_to` en las migraciones `20260911040001` (quincenal) y
  // `20260911050001` (semanal, con `weekStartsOn` — sólo importa para 'weekly', biweekly lo ignora).
  const scopedPayments =
    fe.bag_frequency !== 'monthly' && isCurrentMonth
      ? (() => {
          const subCycle = cycleContaining({ kind: fe.bag_frequency, weekStartsOn }, today)
          return fePayments.filter((p) => {
            const paidOn = format(new Date(p.paid_at), 'yyyy-MM-dd')
            return paidOn >= subCycle.from && paidOn <= subCycle.to
          })
        })()
      : fePayments

  const paidCents = scopedPayments.reduce((acc, p) => acc + p.amountPaidCents, 0)
  const remainingCents = periodClosed ? 0 : Math.max(fe.cents - paidCents, 0)
  const overspentCents = Math.max(paidCents - fe.cents, 0)
  const done = remainingCents === 0

  return { fe, payments: scopedPayments, paidCents, remainingCents, done, overspentCents, dueDate: null }
}

export type FixedExpenseUrgency = 'red' | 'amber' | 'neutral'

/**
 * Rojo si ya venció, ámbar si vence en los próximos 7 días (hoy incluido), neutro más adelante. Sólo
 * tiene sentido para un fijo de una sola vez — una bolsa no "vence", así que no tiene vencimiento y
 * no pasa por acá. Compartida por el widget de Vencimientos de Hoy, los tres grupos de Fijos
 * (Atrasado / Esta semana / Más adelante), las tarjetas y compras de Mis Deudas.
 *
 * Toma la FECHA ya materializada (`FixedExpenseStatus.dueDate`, `CardSummary.dueOn`,
 * `PurchaseSummary.dueOn`), no el día del mes crudo — antes (`dueDay - today.getDate()`) fallaba en
 * silencio con un ciclo semanal a caballo de dos meses: el día 2 de octubre comparado contra "hoy es
 * 29 de septiembre" daba `2 - 29 = -27` → "Venció", cuando en realidad faltan varios días (agujero #4
 * del plan de ciclos).
 */
export function fixedExpenseUrgency(dueDate: Date, today: Date): FixedExpenseUrgency {
  const diff = differenceInCalendarDays(dueDate, today)
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
 * `period` es cualquier fecha dentro del mes a resumir para efectos de BOLSA (como `month` en
 * Fijos.tsx / Hoy.tsx — ver `statusFor`); `payments` son los pagos YA filtrados a los meses que
 * hacen falta (lo que devuelve `useFixedExpensePayments`/`useFixedExpensePaymentsRange`).
 *
 * `window` es opcional (bloque 3 del plan de ciclos): cuando se pasa, además del filtro de vigencia
 * de siempre se aplica sobre los fijos de una sola vez — sólo cuentan si su vencimiento cae dentro
 * de esa ventana, no en cualquier punto del mes. Sin `window` (ningún consumidor lo pasaba antes del
 * bloque 3) el comportamiento es IDÉNTICO al de siempre — y aunque se pase, con una ventana = el mes
 * calendario completo el filtro es un no-op, así que un usuario en ciclo mensual tampoco nota
 * cambio. Es el CICLO que se está mirando (nunca el horizonte extendido de `projectionWindow`): el
 * cliente sólo tiene los pagos del/los mes(es) que se están mirando, así que no puede replicar la
 * acumulación multi-ciclo que sí hace `rpc_projected_balance_range` con un horizonte más largo (ver
 * el comentario en Fijos.tsx sobre por qué el horizonte alimenta SÓLO el headline, nunca esta lista).
 *
 * `months` es opcional y nuevo (bloque 5, ciclo semanal): la lista de meses calendario que toca el
 * ciclo mirado — normalmente uno (`[monthStart de period]`, el default si se omite, igual que
 * siempre), hasta dos si es semanal y cruza el borde del mes. Sin esto, un fijo de una sola vez cuyo
 * vencimiento cae en el SEGUNDO mes de una semana a caballo no aparecería nunca (su `due_day` sólo
 * se materializa contra el primero) — ver `fijoCaeEnCicloMultiMes`/`dueDateInCycle` en `period.ts`.
 *
 * `weekStartsOn` es sólo para una bolsa `bag_frequency: 'weekly'` (default 1 = lunes, igual que
 * `DEFAULT_CYCLE_CONFIG` en `src/lib/cycle.ts`) — de dónde sale la config del ciclo de CAJA de la
 * cuenta (`useCycle().config.weekStartsOn`), reusada acá porque una bolsa semanal no tiene su propio
 * día de inicio de semana configurable, sólo su frecuencia.
 */
export function summarizeFixedExpenses(
  expenses: FixedExpense[],
  payments: FixedExpensePayment[],
  period: Date,
  today: Date,
  window?: Pick<Cycle, 'from' | 'to'>,
  months?: string[],
  weekStartsOn = 1,
): FixedExpensesSummary {
  const monthStart = format(startOfMonth(period), 'yyyy-MM-dd')
  const monthsToCheck = months ?? [monthStart]
  const bounds = cycleMonthsBounds(monthsToCheck)
  const fallbackWindow = { from: format(bounds.start, 'yyyy-MM-dd'), to: format(bounds.end, 'yyyy-MM-dd') }
  const eligible = eligibleFixedExpenses(expenses, bounds.start, bounds.end)
    .filter((fe) => fe.is_active)
    .filter((fe) => !window || fijoCaeEnCicloMultiMes(fe, monthsToCheck, window))
  const statuses = eligible
    .map((fe) =>
      statusFor(fe, payments, period, today, dueDateInCycle(fe, monthsToCheck, window ?? fallbackWindow), weekStartsOn),
    )
    .sort((a, b) => compareFixedExpenses(a.fe, b.fe))

  return {
    pending: statuses.filter((s) => !s.done),
    done: statuses.filter((s) => s.done),
    pendingTotalCents: statuses.reduce((acc, s) => acc + s.remainingCents, 0),
  }
}
