import { parseISO, startOfMonth } from 'date-fns'
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
