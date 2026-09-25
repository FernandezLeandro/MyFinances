import { differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import { cycleContaining, withMonthCarry, type Cycle } from '@/lib/cycle'
import type { FixedExpense, FixedExpensePayment, FixedExpenseSaving } from './api'
import { cycleMonthsBounds, dueDateInCycle, eligibleFixedExpenses } from './period'

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
  /** Mes de esta instancia (día 1, `'yyyy-MM-dd'`) — el `period` con el que se pagan o guardan. FI-04
   *  del QA: una semana que cruza de mes tiene una instancia del fijo por cada mes que toca (igual que
   *  `rpc_projected_balance_range`), así que `fe.id` solo ya no identifica una fila; usar
   *  `fixedExpenseStatusKey`. */
  period: string
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
  /** Bloque 3: suma de lo guardado para este período, SIN capar contra `remainingCents` — quien lo
   *  muestre decide el tope (`summarizeFixedExpenses` usa `min(savedCents, remainingCents)` para el
   *  total que de verdad falta guardar; una fila puede mostrarlo tal cual para "guardaste de más").
   *  Siempre `0` en una bolsa: guardar sólo aplica a un fijo "una vez al mes" (ver el guard más abajo
   *  y la discusión del plan — una bolsa ya se va cargando de a partes como gasto real). */
  savedCents: number
  /** Follow-up: subconjunto de `savedCents` que además generó un movimiento (`transaction_id` no
   *  nulo) — esa plata ya salió del saldo real, así que `remainingCents` la descuenta (a diferencia
   *  de un guardado "aparte", que no afecta el saldo hasta que se paga). Siempre `0` en una bolsa,
   *  igual que `savedCents`. */
  savedMovementCents: number
}

function statusFor(
  fe: FixedExpense,
  payments: FixedExpensePayment[],
  savings: FixedExpenseSaving[],
  period: string,
  today: Date,
  dueDate: string | null,
  weekStartsOn: number,
): FixedExpenseStatus {
  // FI-04: filtrar también por `period` — con una semana que cruza de mes llegan los pagos de los dos
  // meses, y un pago de septiembre no puede marcar pagado octubre (ni «quitar» borrar el de otro mes).
  const fePayments = payments
    .filter((p) => p.fixed_expense_id === fe.id && p.period === period)
    .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))

  if (!fe.is_recurring) {
    const paidCents = fePayments.reduce((acc, p) => acc + p.amountPaidCents, 0)
    const done = fePayments.length > 0
    const feSavings = savings.filter((s) => s.fixed_expense_id === fe.id && s.period === period)
    const savedCents = feSavings.reduce((acc, s) => acc + s.amountCents, 0)
    // Follow-up: sólo lo guardado CON movimiento ya salió del saldo real, así que sólo eso descuenta
    // lo que falta pagar — un guardado "aparte" (siempre el caso en BASIC) no lo toca.
    const savedMovementCents = feSavings.filter((s) => s.transaction_id != null).reduce((acc, s) => acc + s.amountCents, 0)
    return {
      fe,
      period,
      payments: fePayments,
      paidCents,
      remainingCents: done ? 0 : Math.max(fe.cents - savedMovementCents, 0),
      done,
      overspentCents: 0,
      dueDate,
      savedCents,
      savedMovementCents,
    }
  }

  const todayMonth = format(startOfMonth(today), 'yyyy-MM-dd')
  const periodClosed = period < todayMonth
  const isCurrentMonth = period === todayMonth

  // Bolsa quincenal/semanal "en vivo" (bloques 4 y 5 del plan): en el mes EN CURSO sólo cuenta lo
  // cargado en el sub-período que contiene HOY (la quincena o la semana vigente, nunca más de una)
  // para que el remanente sea el de ese sub-período, no el de todo el mes. Mes cerrado (0, más abajo)
  // y mes futuro (presupuesto completo menos lo ya cargado a ese mes) se comportan igual que una
  // bolsa mensual. Espejo exacto de `bag_cycle_from`/`bag_cycle_to` en `rpc_projected_balance_range`
  // (`weekStartsOn` sólo importa para 'weekly'). FI-15: la carga se ubica por `paid_on` (la fecha
  // local que mandó el cliente), igual que la base — antes el cliente usaba la fecha local de
  // `paid_at` y la base la de UTC, y una carga de un domingo a la noche caía en semanas distintas.
  const scopedPayments =
    fe.bag_frequency !== 'monthly' && isCurrentMonth
      ? (() => {
          const subCycle = cycleContaining({ kind: fe.bag_frequency, weekStartsOn }, today)
          return fePayments.filter((p) => p.paid_on >= subCycle.from && p.paid_on <= subCycle.to)
        })()
      : fePayments

  const paidCents = scopedPayments.reduce((acc, p) => acc + p.amountPaidCents, 0)
  const remainingCents = periodClosed ? 0 : Math.max(fe.cents - paidCents, 0)
  const overspentCents = Math.max(paidCents - fe.cents, 0)
  const done = remainingCents === 0

  return {
    fe,
    period,
    payments: scopedPayments,
    paidCents,
    remainingCents,
    done,
    overspentCents,
    dueDate: null,
    savedCents: 0,
    savedMovementCents: 0,
  }
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

/** Key estable para una fila de la lista (bloque 4, FI-04/FI-06): con una semana a caballo de dos
 *  meses, un mismo `fe.id` puede tener dos instancias — una por mes — así que `fe.id` solo ya no
 *  identifica una fila (React se queja de keys duplicadas, y "quitar pago" tomaría cualquiera de
 *  las dos). Usar donde antes se usaba `status.fe.id` como `key`. */
export function fixedExpenseStatusKey(status: Pick<FixedExpenseStatus, 'fe' | 'period'>): string {
  return `${status.fe.id}-${status.period}`
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

/**
 * Bloque 3 (FI-13): cuánto aporta CADA fijo a "Total del mes/quincena/semana" — antes ese total
 * sumaba siempre el importe ACTUAL de la plantilla (`fe.cents`), aunque el mes se hubiera pagado con
 * otro importe (aumento a mitad de año) o un mes futuro ya la hubiera actualizado (FI-02/FI-10), y
 * "Disponible" (`Sueldo − Pagado − Falta pagar`) no cerraba con ese total. Con esto, Total = Pagado +
 * Falta pagar por construcción: pagado aporta lo que de verdad salió (`paidCents`), pendiente aporta
 * el importe vigente (lo que sale si se paga hoy), y una bolsa aporta lo mayor entre el presupuesto y
 * lo cargado (si se pasó, el total tiene que reflejar el exceso, no esconderlo).
 */
export function cycleTotalCents(status: Pick<FixedExpenseStatus, 'fe' | 'paidCents' | 'done'>): number {
  if (status.fe.is_recurring) return Math.max(status.fe.cents, status.paidCents)
  return status.done ? status.paidCents : status.fe.cents
}

export interface FixedExpensesSummary {
  pending: FixedExpenseStatus[]
  done: FixedExpenseStatus[]
  /** Igual a lo que resta el segundo término de `rpc_projected_balance` para este período: la suma
   *  de `remainingCents` de TODOS los fijos activos elegibles, pagados o no (un fijo saldado ya
   *  aporta 0). */
  pendingTotalCents: number
  /** Bloque 3: cuánto de lo que falta pagar (sólo fijos "una vez al mes" pendientes — una bolsa no
   *  entra, ver `statusFor`) ya está guardado. Capado por fijo a su propio `remainingCents`: guardar
   *  de más para uno no "adelanta" a otro. */
  savedTotalCents: number
  /** `pendingTotalCents` de los fijos de una vez pendientes, menos `savedTotalCents` — nunca
   *  negativo. Es lo que todavía falta juntar, la cifra que muestra `FijosCicloCard` en Hoy (bloque
   *  4) cuando hay algo guardado. */
  missingToSaveCents: number
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
 * Adentro se ensancha con `withMonthCarry` (N2 del re-test de QA): un fijo de una sola vez vencido
 * en un ciclo ANTERIOR del mismo mes se arrastra como atrasado al ciclo actual, en vez de
 * desaparecer — los pagos de ese mes ya están entre `payments` (se piden por mes, no por mitad de
 * mes), así que no hace falta traer nada más para saber si sigue impago.
 *
 * `months` es opcional y nuevo (bloque 5, ciclo semanal): la lista de meses calendario que toca el
 * ciclo mirado — normalmente uno (`[monthStart de period]`, el default si se omite, igual que
 * siempre), hasta dos si es semanal y cruza el borde del mes. Con dos meses, un mismo fijo puede
 * generar HASTA DOS instancias — una por mes, cada una con su propio `period`, sus propios pagos y su
 * propia fecha materializada (bloque 4, FI-04/FI-06) — espejo exacto del cross join `months × fijos`
 * de `rpc_projected_balance_range`: una bolsa mensual, por ejemplo, tiene presupuesto propio en CADA
 * mes que toca la semana, no uno compartido. Sin `months`, sigue siendo un único mes, un único
 * `period` — cero cambio de comportamiento para mensual/quincenal (nunca cruzan el borde del mes).
 *
 * `weekStartsOn` es sólo para una bolsa `bag_frequency: 'weekly'` (default 1 = lunes, igual que
 * `DEFAULT_CYCLE_CONFIG` en `src/lib/cycle.ts`) — de dónde sale la config del ciclo de CAJA de la
 * cuenta (`useCycle().config.weekStartsOn`), reusada acá porque una bolsa semanal no tiene su propio
 * día de inicio de semana configurable, sólo su frecuencia.
 *
 * `savings` (bloque 3, opcional — `[]` por default: un consumidor que no le interesa el guardado,
 * como los tests viejos, no nota diferencia) son TODOS los guardados de los períodos que hacen falta,
 * mismo criterio multi-período que `payments` (`useFixedExpenseSavings`).
 */
export function summarizeFixedExpenses(
  expenses: FixedExpense[],
  payments: FixedExpensePayment[],
  period: Date,
  today: Date,
  window?: Pick<Cycle, 'from' | 'to'>,
  months?: string[],
  weekStartsOn = 1,
  savings: FixedExpenseSaving[] = [],
): FixedExpensesSummary {
  const monthStart = format(startOfMonth(period), 'yyyy-MM-dd')
  const monthsToCheck = months ?? [monthStart]
  const bounds = cycleMonthsBounds(monthsToCheck)
  const fallbackWindow = { from: format(bounds.start, 'yyyy-MM-dd'), to: format(bounds.end, 'yyyy-MM-dd') }
  const carriedWindow = window ? withMonthCarry(window) : undefined
  const effectiveWindow = carriedWindow ?? fallbackWindow
  // FI-22: ya no se filtran acá los pausados — un fijo pausado que YA tiene un pago o una carga en
  // el período sigue contando como pagado ese período (ver `finalizePausedInstance` más abajo). Uno
  // pausado sin nada pagado en el período simplemente no genera ninguna instancia — nunca aparece
  // como pendiente, ni resta del proyectado.
  const eligible = eligibleFixedExpenses(expenses, bounds.end)

  // FI-22: un fijo pausado sólo deja una instancia visible si ya tiene algo pagado/cargado en su
  // período — y esa instancia queda "cerrada" (no pendiente, no resta) aunque no haya llegado al
  // importe completo (una bolsa pausada con $3.000 de $80.000 cargados no tiene forma de completar
  // el resto: mostrarla como pendiente sería pedir una acción que ya no se puede hacer). `null`
  // descarta la instancia entera.
  function finalizePausedInstance(status: FixedExpenseStatus, fe: FixedExpense): FixedExpenseStatus | null {
    if (fe.is_active) return status
    if (status.payments.length === 0) return null
    return { ...status, done: true, remainingCents: 0 }
  }

  // Bloque 4 (FI-04/FI-06): una instancia por (fijo, mes) que toca `monthsToCheck`, no una por fijo —
  // con mensual/quincenal `monthsToCheck` tiene un único elemento y esto da exactamente una instancia
  // por fijo, igual que siempre.
  const statuses = eligible
    .flatMap((fe): FixedExpenseStatus[] => {
      if (fe.is_recurring) {
        // Una bolsa existe en un mes si ya había arrancado para el FIN de ese mes — mismo criterio
        // que `eligibleFixedExpenses`, pero mes a mes en vez de contra el fin del rango completo.
        return monthsToCheck
          .filter((m) => parseISO(fe.starts_on) <= endOfMonth(parseISO(m)))
          .map((m) => statusFor(fe, payments, savings, m, today, null, weekStartsOn))
          .map((s) => finalizePausedInstance(s, fe))
          .filter((s): s is FixedExpenseStatus => s != null)
      }
      // `dueDateInCycle(fe, [m], effectiveWindow)` — un solo mes por llamada, no `monthsToCheck`
      // entero: así cada mes se evalúa contra la ventana por su cuenta, en vez de quedarse con el
      // primero que matchea (lo que antes ocultaba la instancia del segundo mes cuando la primera ya
      // caía adentro).
      return monthsToCheck
        .map((m) => {
          const dueDate = dueDateInCycle(fe, [m], effectiveWindow)
          if (dueDate == null) return null
          return statusFor(fe, payments, savings, m, today, dueDate, weekStartsOn)
        })
        .filter((s): s is FixedExpenseStatus => s != null)
        // FI-07: un fijo "una vez al mes" cuyo vencimiento materializado en ESTE mes es anterior a
        // `starts_on` no existía cuando "venció" — no cuenta como atrasado ni resta del proyectado,
        // salvo que YA tenga un pago ahí (no esconder un pago real). Espejo de
        // `rpc_projected_balance_range` (`20260923080001_fijos_alta_y_deshacer_importe.sql`).
        .filter((s) => s.dueDate! >= fe.starts_on || s.done)
        // FI-21: un atrasado arrastrado por `withMonthCarry` (`dueDate` antes de esta ventana) sólo
        // se trae para no perder de vista lo que sigue IMPAGO — si ya está pagado, sólo cuenta como
        // "pagado" acá si el pago cayó dentro de la ventana que se está mirando; si se pagó antes
        // (en un ciclo anterior), ya se resolvió ahí y no tiene que reaparecer en este.
        .filter((s) => {
          if (!window || !s.done || s.dueDate! >= window.from) return true
          return s.payments.some((p) => p.paid_on >= window.from)
        })
        .map((s) => finalizePausedInstance(s, fe))
        .filter((s): s is FixedExpenseStatus => s != null)
    })
    .sort((a, b) => compareFixedExpenses(a.fe, b.fe) || a.period.localeCompare(b.period))

  const pending = statuses.filter((s) => !s.done)
  // Sólo fijos de una vez: una bolsa ignora el guardado (`savedCents` ya viene en 0 desde
  // `statusFor`), así que incluirla acá no cambiaría nada — el filtro es sólo para que quede
  // explícito qué cuenta.
  const pendingOneTime = pending.filter((s) => !s.fe.is_recurring)
  // `savedTotalCents` es sólo el guardado "aparte" (SIN movimiento): lo guardado CON movimiento ya
  // salió del saldo real y ya está descontado de `remainingCents` (ver `statusFor`) — contarlo acá
  // de nuevo lo mostraría dos veces (en "Fijos por pagar", ya neto, y otra vez en "Guardado para
  // fijos", como si todavía estuviera esperando).
  const savedTotalCents = pendingOneTime.reduce(
    (acc, s) => acc + Math.min(s.savedCents - s.savedMovementCents, s.remainingCents),
    0,
  )
  const missingToSaveCents = Math.max(pendingOneTime.reduce((acc, s) => acc + s.remainingCents, 0) - savedTotalCents, 0)

  return {
    pending,
    done: statuses.filter((s) => s.done),
    pendingTotalCents: statuses.reduce((acc, s) => acc + s.remainingCents, 0),
    savedTotalCents,
    missingToSaveCents,
  }
}

export interface AmountAfterCopy {
  kind: 'remaining' | 'complete' | 'over'
  /** Cuánto falta (`remaining`) o cuánto sobra (`over`) — `0` en `complete`. */
  cents: number
}

/**
 * Bloque 2 del plan de arreglo (FI-12): decide qué dice `MarkPaidDialog` bajo el importe según si lo
 * guardado/cargado queda corto, exacto o de más. Antes "de más" mostraba el mismo texto que "exacto"
 * ("Con esto lo tenés cubierto."/"Completás el presupuesto"), sin avisar que ese excedente sale del
 * saldo igual. `alreadyCents` es lo que ya había antes de este importe (pagos o guardados previos del
 * mismo período); `cents`, lo que se está por confirmar ahora.
 */
export function amountAfterCopy(targetCents: number, alreadyCents: number, cents: number): AmountAfterCopy {
  const total = alreadyCents + cents
  if (total > targetCents) return { kind: 'over', cents: total - targetCents }
  if (total === targetCents) return { kind: 'complete', cents: 0 }
  return { kind: 'remaining', cents: targetCents - total }
}

export interface PreAccountsPaymentCopy {
  title: string
  confirmLabel: string
  paragraphs: string[]
}

/**
 * Texto del freno `payment_before_accounts`: el pago es de antes de la primera cuenta, así que ya
 * está descontado de la apertura, y volver a pagarlo lo restaría dos veces.
 *
 * Básico no ve Cuentas (las suyas, si las tuvo, quedan en pausa), así que ahí el texto no las nombra
 * ni aconseja editar el movimiento o reajustar el saldo — dos cosas que ese plan no puede hacer.
 */
export function preAccountsPaymentCopy({
  action,
  canCuentas,
  canEditMovement,
}: {
  action: 'unmark' | 'delete'
  canCuentas: boolean
  canEditMovement: boolean
}): PreAccountsPaymentCopy {
  const isDelete = action === 'delete'
  const verb = isDelete ? 'eliminás' : 'quitás'
  const risk = `Si lo ${verb} y lo volvés a pagar, se descuenta dos veces.`
  const paragraphs = [
    canCuentas
      ? `Este pago es de antes de que crearas tus cuentas: esa plata ya está descontada del saldo con el que arrancaron. ${risk}`
      : `Este pago ya está descontado. ${risk}`,
  ]
  const advice = [
    canEditMovement && !isDelete ? 'Para cambiar el importe o la fecha, editá el movimiento.' : null,
    canCuentas ? 'Si en realidad no lo pagaste, después reajustá el saldo de la cuenta.' : null,
  ].filter((s): s is string => s != null)
  if (advice.length > 0) paragraphs.push(advice.join(' '))
  return {
    title: isDelete ? '¿Eliminar este movimiento?' : '¿Quitar este pago?',
    confirmLabel: isDelete ? 'Eliminar igual' : 'Quitar igual',
    paragraphs,
  }
}

/** FI-19 del QA de Fijos: nombre duplicado entre fijos del usuario, sin distinguir mayúsculas ni
 *  espacios — mismo criterio que `accountNameError` en `accounts/aggregate.ts`, pero acá compara
 *  contra TODOS los fijos (activos y pausados): a diferencia de una cuenta archivada (que no vuelve
 *  a aparecer en ningún selector), un fijo pausado se puede reactivar, así que dos fijos "Alquiler"
 *  (uno activo, uno pausado) siguen confundiendo igual en el buscador del `+` de Básico. Sólo del
 *  lado del cliente, sin índice único en la base — no rompe a quien ya tenga duplicados hoy.
 *  `excludeId` es el propio fijo al editar, para no chocar consigo mismo. */
export function fixedExpenseNameError(input: { name: string; expenses: readonly FixedExpense[]; excludeId?: string }): string | null {
  // `name` puede llegar `undefined` en el primer render de un formulario con react-hook-form: los
  // `defaultValues` que arma `useForm` no incluyen este campo (lo llena `reset()` en un `useEffect`,
  // después del primer render) — sin este guard, `FixedExpenseFormDialog` crasheaba al abrir "Nuevo
  // fijo" (bug real encontrado al verificar FI-19 en vivo, `.trim()` sobre `undefined`).
  const normalized = (input.name ?? '').trim().toLowerCase()
  if (!normalized) return null
  const clash = input.expenses.some((fe) => fe.id !== input.excludeId && fe.name.trim().toLowerCase() === normalized)
  return clash ? 'Ya tenés un fijo con ese nombre.' : null
}

/** HO-07 del QA de Hoy: la fila "guardado" de Vencimientos mostraba un número distinto en
 *  escritorio (`min(savedCents, fe.cents)`) que en mobile (`min(savedCents, remainingCents)`) cuando
 *  lo guardado superaba lo que falta pagar — dos JSX casi idénticos con un tope distinto. Se
 *  centraliza acá el tope correcto: contra el importe TOTAL del fijo, no contra `remainingCents`
 *  (que ya resta lo guardado CON movimiento, así que usarlo de tope mostraría de menos apenas lo
 *  guardado cubre sólo una parte del fijo). */
export function upcomingSavedCents(status: Pick<FixedExpenseStatus, 'savedCents' | 'fe'>): number {
  return Math.min(status.savedCents, status.fe.cents)
}
