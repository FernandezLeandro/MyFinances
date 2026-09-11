import { parseISO, startOfMonth } from 'date-fns'
import { dueFallsInCycle, type Cycle } from '@/lib/cycle'
import type { FixedExpense } from './api'

/**
 * De todos los fijos de la cuenta, cuáles corresponden al período dado — un fijo cargado a mitad de
 * año no aplica a meses anteriores a `starts_on`, y uno dado de baja no aplica a partir de `ends_on`.
 * Compartido entre Fijos (navega mes a mes) y Hoy (siempre mes en curso), así ambas pantallas
 * calculan "cuántos fijos faltan pagar" exactamente igual.
 */
export function eligibleFixedExpenses(fixedExpenses: FixedExpense[], periodStart: Date, periodEnd: Date): FixedExpense[] {
  return fixedExpenses.filter((fe) => {
    if (new Date(fe.starts_on) > periodEnd) return false
    if (fe.ends_on && new Date(fe.ends_on) < periodStart) return false
    return true
  })
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
 * siempre `true`: siguen 100% mensuales (bloque 4 del plan, todavía sin frecuencia propia), la
 * mensualidad la decide `statusFor` en `aggregate.ts`, no esto.
 */
export function fijoCaeEnCiclo(
  fe: Pick<FixedExpense, 'due_day' | 'is_recurring'>,
  monthStart: string,
  window: Pick<Cycle, 'from' | 'to'>,
): boolean {
  if (fe.is_recurring || fe.due_day == null) return true
  return dueFallsInCycle(window, monthStart, fe.due_day)
}
