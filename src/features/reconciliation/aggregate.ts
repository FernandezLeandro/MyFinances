/**
 * Suma y compara — función pura, separada de la red a propósito (mismo criterio que
 * `credits/aggregate.ts`: se verifica con números a mano sin levantar la app). Acá vive el único
 * dato que se puede invertir sin querer: el signo de la diferencia.
 */
import type { BalanceLocation } from './api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'

export interface Reconciliation {
  /** Suma de los lugares (dónde está la plata físicamente). */
  locationsCents: number
  /** Lo que te deben Y todavía cuenta como plata tuya: pendiente y sin `already_expensed`.
   *  Prestar efectivo no genera un gasto, así que `rpc_current_balance` sigue contando esa plata —
   *  por eso suma acá. Una deuda que ya cargaste como gasto NO: esa plata ya se descontó del saldo,
   *  sumarla marcaría un excedente falso. La regla vive en `ReceivableSummary.cuentaEnCuadre`. */
  receivablesCents: number
  /** Pendiente de las deudas que YA salieron del saldo (`already_expensed`, no cobradas) — no suma
   *  en ningún lado, se expone sólo para poder mostrarlas en el diálogo sin que el usuario piense
   *  que el cuadre las ignoró. */
  expensedPendingCents: number
  /** `locationsCents + receivablesCents`. Lo que se compara contra el saldo. */
  totalCents: number
  /** `totalCents - balanceCents`. Positivo → tenés más de lo que la app sabe, falta un ingreso.
   *  Negativo → tenés menos, falta un gasto. */
  diffCents: number
  cuadrado: boolean
}

export function reconciliar(
  locations: BalanceLocation[],
  receivables: ReceivableSummary[],
  balanceCents: number,
): Reconciliation {
  const locationsCents = locations.reduce((sum, l) => sum + l.amountCents, 0)
  const receivablesCents = receivables.filter((r) => r.cuentaEnCuadre).reduce((sum, r) => sum + r.pendingCents, 0)
  const expensedPendingCents = receivables
    .filter((r) => r.receivable.already_expensed && !r.cobrada)
    .reduce((sum, r) => sum + r.pendingCents, 0)
  const totalCents = locationsCents + receivablesCents
  const diffCents = totalCents - balanceCents
  return { locationsCents, receivablesCents, expensedPendingCents, totalCents, diffCents, cuadrado: diffCents === 0 }
}
