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
   *  Negativo → tenés menos, falta un gasto. Esta es LA diferencia que "Sólo ajustar"/"Registrar
   *  como movimiento" resuelven — nunca se calcula por cuenta, ver `perAccount`. */
  diffCents: number
  cuadrado: boolean
  /** DIAGNÓSTICO por cuenta: real declarado (`amountCents`) vs. derivado (apertura + movimientos
   *  imputados ± transferencias) de cada `BalanceLocation`. Sólo dice DÓNDE podría estar el
   *  descuadre — nunca se suma a `diffCents` ni reemplaza el ajuste global: prestar efectivo no
   *  genera movimiento (`cuentaEnCuadre`), así que el derivado de esa cuenta queda por encima del
   *  real sin que haya ningún error real que corregir ahí. */
  perAccount: { accountId: string; realCents: number; derivedCents: number; diffCents: number }[]
  /** Plata que el saldo global (`rpc_current_balance`, 100% movimientos, sin ningún concepto de
   *  apertura) ya cuenta pero no está imputada a ninguna cuenta (movimientos cargados sin elegir
   *  "con qué lo pagué", o cargados antes de que existieran las cuentas). No es un error: es trabajo
   *  pendiente de imputar, y se muestra aparte para no confundirlo con la diferencia real.
   *
   *  NO es `balanceCents - Σ derivedCents` a secas — esa resta arrastraría las aperturas (que sólo
   *  viven en `derivedCents`, nunca en el saldo global) como si fueran movimientos sin asignar,
   *  inflando este número por cada cuenta con apertura > 0 aunque no falte imputar nada. Lo que
   *  `derivedCents` explica del saldo global es sólo la parte de movimientos reales:
   *  `Σ derivedCents - Σ openingCents`. Sin asignar es lo que queda afuera de esa parte. */
  sinAsignarCents: number
}

export function reconciliar(
  locations: BalanceLocation[],
  receivables: ReceivableSummary[],
  balanceCents: number,
  accountDerivedCents: Map<string, number> = new Map(),
): Reconciliation {
  const locationsCents = locations.reduce((sum, l) => sum + l.amountCents, 0)
  const receivablesCents = receivables.filter((r) => r.cuentaEnCuadre).reduce((sum, r) => sum + r.pendingCents, 0)
  const expensedPendingCents = receivables
    .filter((r) => r.receivable.already_expensed && !r.cobrada)
    .reduce((sum, r) => sum + r.pendingCents, 0)
  const totalCents = locationsCents + receivablesCents
  const diffCents = totalCents - balanceCents

  const perAccount = locations.map((l) => {
    const derivedCents = accountDerivedCents.get(l.id) ?? l.openingCents
    return { accountId: l.id, realCents: l.amountCents, derivedCents, diffCents: l.amountCents - derivedCents }
  })
  const derivedTotalCents = locations.reduce((sum, l) => sum + (accountDerivedCents.get(l.id) ?? l.openingCents), 0)
  const openingTotalCents = locations.reduce((sum, l) => sum + l.openingCents, 0)
  // Ver el comentario de `sinAsignarCents`: se le suma de vuelta la apertura para que sólo quede la
  // parte de `derivedTotalCents` que sí viene de movimientos reales.
  const sinAsignarCents = balanceCents - (derivedTotalCents - openingTotalCents)

  return {
    locationsCents,
    receivablesCents,
    expensedPendingCents,
    totalCents,
    diffCents,
    cuadrado: diffCents === 0,
    perAccount,
    sinAsignarCents,
  }
}
