/**
 * Suma y compara — función pura, separada de la red a propósito (mismo criterio que
 * `credits/aggregate.ts`: se verifica con números a mano sin levantar la app). Acá vive el único
 * dato que se puede invertir sin querer: el signo de la diferencia.
 */
import type { BalanceLocation } from './api'

export interface Reconciliation {
  /** Suma de todos los lugares. */
  totalCents: number
  /** `totalCents - balanceCents`. Positivo → tenés más de lo que la app sabe, falta un ingreso.
   *  Negativo → tenés menos, falta un gasto. */
  diffCents: number
  cuadrado: boolean
}

export function reconciliar(locations: BalanceLocation[], balanceCents: number): Reconciliation {
  const totalCents = locations.reduce((sum, l) => sum + l.amountCents, 0)
  const diffCents = totalCents - balanceCents
  return { totalCents, diffCents, cuadrado: diffCents === 0 }
}
