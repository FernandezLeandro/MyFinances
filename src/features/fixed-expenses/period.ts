import { parseISO, startOfMonth } from 'date-fns'

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
