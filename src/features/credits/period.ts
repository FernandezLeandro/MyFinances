import { addMonths, differenceInCalendarMonths, format, parseISO, startOfMonth } from 'date-fns'

/**
 * Aritmética de cuotas — no hay contador mutable ni filas que se borran: qué cuota de una compra
 * cae en un período dado se DERIVA de `primeraCuota` + `cuotas`. Una compra de 1 cuota deja de
 * matchear al mes siguiente sola; una de 12 se apaga sola en el mes 13. Volver a mirar un mes viejo
 * siempre muestra lo mismo, porque nada se modifica ni se elimina.
 *
 * Todo pasa por `parseISO` (nunca `new Date(string)`): un `'yyyy-MM-dd'` parseado con `new Date`
 * cae en medianoche UTC, que en Argentina (UTC−3) corre el día 1 al 31 del mes anterior — el mismo
 * corrimiento que ya mordió en `fixed-expenses/period.ts`. `parseISO` interpreta en hora local y lo
 * evita.
 */

/** Número de cuota (1-based) que corresponde a `periodo` para una compra cuya primera cuota fue
 *  `primeraCuota`. No valida si cae dentro del rango — para eso está `caeEnPeriodo`. */
export function numeroDeCuota(primeraCuota: string, periodo: string): number {
  return differenceInCalendarMonths(startOfMonth(parseISO(periodo)), startOfMonth(parseISO(primeraCuota))) + 1
}

/** `true` si la cuota `numeroDeCuota(primeraCuota, periodo)` existe: entre 1 y `cuotas` inclusive. */
export function caeEnPeriodo(primeraCuota: string, cuotas: number, periodo: string): boolean {
  const n = numeroDeCuota(primeraCuota, periodo)
  return n >= 1 && n <= cuotas
}

/** El período (`'yyyy-MM-dd'`, día 1) de la última cuota de una compra. */
export function ultimoPeriodo(primeraCuota: string, cuotas: number): string {
  return format(addMonths(startOfMonth(parseISO(primeraCuota)), cuotas - 1), 'yyyy-MM-dd')
}
