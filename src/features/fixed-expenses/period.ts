import { endOfMonth, parseISO, startOfMonth } from 'date-fns'
import { dueDateInMonth, dueFallsInCycle, type Cycle } from '@/lib/cycle'
import type { FixedExpense } from './api'

/** Cómo nombrar el período de una bolsa en la UI (MarkPaidDialog, el form) según su frecuencia
 *  propia — "presupuesto mensual"/"este mes", "…quincenal"/"esta quincena" o "…semanal"/"esta
 *  semana". */
export function bagPeriodNoun(bagFrequency: FixedExpense['bag_frequency']): { adjective: string; thisPeriod: string } {
  switch (bagFrequency) {
    case 'biweekly':
      return { adjective: 'quincenal', thisPeriod: 'esta quincena' }
    case 'weekly':
      return { adjective: 'semanal', thisPeriod: 'esta semana' }
    default:
      return { adjective: 'mensual', thisPeriod: 'este mes' }
  }
}

/**
 * De todos los fijos de la cuenta, cuáles corresponden al período dado — un fijo cargado a mitad de
 * año no aplica a meses anteriores a `starts_on`. Compartido entre Fijos (navega mes a mes) y Hoy
 * (siempre mes en curso), así ambas pantallas calculan "cuántos fijos faltan pagar" exactamente
 * igual.
 */
export function eligibleFixedExpenses(fixedExpenses: FixedExpense[], periodEnd: Date): FixedExpense[] {
  // `parseISO`, no `new Date(string)`: `starts_on` viaja como 'yyyy-MM-dd', que `new Date` parsea
  // como medianoche UTC — en Argentina (UTC−3) cae en el día anterior. Mismo gotcha documentado en
  // `permiteActualizarPlantilla`, acá.
  return fixedExpenses.filter((fe) => parseISO(fe.starts_on) <= periodEnd)
}

/**
 * Decide si marcar un fijo como pagado en `period` debe actualizar el importe de la plantilla.
 * Sólo el mes en curso o uno futuro — un pago atrasado (mes pasado) no puede "corregir" hacia atrás
 * el importe vigente, o el saldo proyectado de meses futuros quedaría mal.
 *
 * `period` viaja como string `'yyyy-MM-dd'`. Ojo con `new Date(period)`: parsea como medianoche
 * UTC, que en Argentina (UTC−3) cae en el día anterior — usar `parseISO` evita ese corrimiento.
 * `hoy` se inyecta por parámetro para no depender del reloj real en los tests.
 */
export function permiteActualizarPlantilla(period: string, hoy: Date): boolean {
  return startOfMonth(parseISO(period)) >= startOfMonth(hoy)
}

/**
 * Espejo cliente de la rama "no recurrente" del filtro de `rpc_projected_balance_range` — decide
 * si un fijo de una sola vez cae dentro de `window`, según su vencimiento materializado en
 * `monthStart` (ver `dueFallsInCycle` en `src/lib/cycle.ts`). Con `window` = el ciclo mensual de su
 * propio mes es un no-op: cualquier `due_day` cae siempre adentro, así que el comportamiento de
 * siempre no cambia un caso.
 *
 * `window` es `{from, to}` (no siempre el `Cycle` que se está mirando): una pantalla que navega
 * (Fijos, Mis Deudas) tiene que pasar el HORIZONTE (`projectionWindow`), no el ciclo tal cual, para
 * que este filtro coincida exacto con lo que descuenta `rpc_projected_balance_range` — si no, el
 * desglose del panel y el número grande divergen en silencio (el riesgo #1 del plan). Hoy, que
 * nunca navega, puede pasar directo su `cycle` (horizonte y ciclo coinciden siempre ahí).
 *
 * Las bolsas (`is_recurring`, sin `due_day`) no tienen vencimiento — no las evalúa esta función, dan
 * siempre `true`: su remanente lo decide `statusFor` en `aggregate.ts` (bloque 4 del plan, según
 * `fe.bag_frequency` — mensual o quincenal), no esto.
 */
export function fijoCaeEnCiclo(
  fe: Pick<FixedExpense, 'due_day' | 'is_recurring'>,
  monthStart: string,
  window: Pick<Cycle, 'from' | 'to'>,
): boolean {
  if (fe.is_recurring || fe.due_day == null) return true
  return dueFallsInCycle(window, monthStart, fe.due_day)
}

/**
 * Generaliza `fijoCaeEnCiclo` a un ciclo que puede tocar más de un mes — sólo el semanal (bloque 5
 * del plan: mensual y quincenal nunca cruzan el borde del mes, `months` siempre tiene un elemento
 * ahí y esto es idéntico a `fijoCaeEnCiclo`). Un `due_day` se materializa distinto en cada mes que
 * toca `months` (día 2 de septiembre no es el mismo día que día 2 de octubre) — prueba cada uno y
 * da `true` si CUALQUIERA cae dentro de `window`.
 */
export function fijoCaeEnCicloMultiMes(
  fe: Pick<FixedExpense, 'due_day' | 'is_recurring'>,
  months: string[],
  window: Pick<Cycle, 'from' | 'to'>,
): boolean {
  if (fe.is_recurring || fe.due_day == null) return true
  return months.some((monthStart) => fijoCaeEnCiclo(fe, monthStart, window))
}

/**
 * El vencimiento materializado de un fijo de una sola vez dentro de `window`, probando cada mes de
 * `months` — el gemelo de `fijoCaeEnCicloMultiMes` que además devuelve LA FECHA (para
 * `fixedExpenseUrgency`, que necesita comparar fechas reales, no sólo el día del mes — ver el
 * agujero #4 del plan: `dueDay - today.getDate()` da cualquier cosa cuando el vencimiento cae en un
 * mes distinto al de `today`). `null` para una bolsa, o si ningún mes lo ubica dentro de `window`
 * (no debería pasar si `fe` ya pasó `fijoCaeEnCicloMultiMes`, pero queda defensivo).
 */
export function dueDateInCycle(
  fe: Pick<FixedExpense, 'due_day' | 'is_recurring'>,
  months: string[],
  window: Pick<Cycle, 'from' | 'to'>,
): string | null {
  if (fe.is_recurring || fe.due_day == null) return null
  for (const monthStart of months) {
    const due = dueDateInMonth(monthStart, fe.due_day)
    if (due >= window.from && due <= window.to) return due
  }
  return null
}

/** El "vencé el {due_day}" de la PLANTILLA de un fijo (`FixedExpenseDetailDialog`, la ficha general —
 *  no un mes concreto, que ya usa la fecha materializada en `status.dueDate`). Con `due_day` 29–31,
 *  un mes corto lo clampea (L2 del QA: "Vence el 31" en un mes de 30 días) — acá se aclara la regla
 *  en vez de mentir una fecha fija, porque no hay un mes concreto contra el cual materializarla. */
export function dueDayTemplateLabel(dueDay: number): string {
  return dueDay >= 29 ? `Vence el ${dueDay} (o el último día del mes, si es más corto)` : `Vence el ${dueDay}`
}

/** Límites calendario que cubren TODOS los meses que toca un ciclo — `[inicio del primero, fin del
 *  último]`. Con mensual/quincenal es el único mes de siempre; con semanal a caballo de dos, cubre
 *  ambos, para no perder de vista un fijo cuyo `starts_on` sólo se solapa con el segundo (ver
 *  `eligibleFixedExpenses`). */
export function cycleMonthsBounds(months: string[]): { start: Date; end: Date } {
  return { start: startOfMonth(parseISO(months[0])), end: endOfMonth(parseISO(months[months.length - 1])) }
}
