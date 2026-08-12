/**
 * Suma y compara — función pura, separada de la red a propósito (mismo criterio que
 * `credits/aggregate.ts`: se verifica con números a mano sin levantar la app). Acá vive el único
 * dato que se puede invertir sin querer: el signo de la diferencia.
 */
import type { BalanceLocation, Receivable } from './api'

export interface Reconciliation {
  /** Suma de los lugares (dónde está la plata físicamente). */
  locationsCents: number
  /** Suma de lo que te deben — no es plata en ningún lugar todavía, pero ya está contada en el
   *  saldo de la app (ver comentario de la migración `receivables`), así que suma acá. */
  receivablesCents: number
  /** `locationsCents + receivablesCents`. Lo que se compara contra el saldo. */
  totalCents: number
  /** `totalCents - balanceCents`. Positivo → tenés más de lo que la app sabe, falta un ingreso.
   *  Negativo → tenés menos, falta un gasto. */
  diffCents: number
  cuadrado: boolean
}

export function reconciliar(locations: BalanceLocation[], receivables: Receivable[], balanceCents: number): Reconciliation {
  const locationsCents = locations.reduce((sum, l) => sum + l.amountCents, 0)
  const receivablesCents = receivables.reduce((sum, r) => sum + r.amountCents, 0)
  const totalCents = locationsCents + receivablesCents
  const diffCents = totalCents - balanceCents
  return { locationsCents, receivablesCents, totalCents, diffCents, cuadrado: diffCents === 0 }
}
