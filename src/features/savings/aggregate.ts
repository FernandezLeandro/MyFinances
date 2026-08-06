/**
 * Agregación de Patrimonio — funciones puras, separadas de la capa de red a propósito: el cálculo
 * depende de la cotización en vivo (que vive en `fx/api.ts`) y de los aportes (`savings/api.ts`),
 * y así se puede verificar con números a mano sin levantar la app.
 *
 * Todo opera en centavos enteros, la misma regla que el resto de la plata en Saldo.
 */
import type { SavingsBucket, SavingsEntry } from './api'

export interface CurrencyNet {
  /** Centavos de ARS netos (depósitos − retiros). */
  arsCents: number
  /** Centavos de USD netos (depósitos − retiros). */
  usdCents: number
}

export function netByCurrency(entries: SavingsEntry[]): CurrencyNet {
  let arsCents = 0
  let usdCents = 0
  for (const entry of entries) {
    const signed = entry.kind === 'deposit' ? entry.cents : -entry.cents
    if (entry.currency === 'ARS') arsCents += signed
    else usdCents += signed
  }
  return { arsCents, usdCents }
}

/**
 * Valor actual en la moneda principal (ARS). `usdRateCents` es la cotización EN VIVO (centavos de
 * ARS por 1 USD) — no la de compra de cada aporte, esa sólo importa para el costo. `null` si hay
 * saldo en USD y no hay ninguna cotización disponible: mostrar "$0" ahí sería mentir.
 */
export function valueInMainCents(net: CurrencyNet, usdRateCents: number | null): number | null {
  if (net.usdCents === 0) return net.arsCents
  if (usdRateCents == null) return null
  return net.arsCents + Math.round((net.usdCents * usdRateCents) / 100)
}

export interface GainResult {
  costArsCents: number | null
  gainCents: number | null
  /** Depósitos en USD sin cotización de compra cargada — mientras haya alguno, la ganancia no se muestra. */
  missingRateCount: number
}

/**
 * Ganancia = valor actual − costo de adquisición. El costo de un depósito en ARS es su propio
 * importe (no hay riesgo de cambio); el de un depósito en USD es `amount × rate_to_main` (lo que
 * costó en ARS el día que se cargó). Sólo los DEPÓSITOS necesitan esa cotización — un retiro no
 * "compra" nada, así que reduce el costo al precio promedio de los depósitos ya cargados, sin
 * pedirle al usuario un dato que no tiene sentido para esa operación.
 *
 * Si falta la cotización en algún depósito en USD, o no hay cotización en vivo para valuar el
 * total, la ganancia queda explícitamente no disponible en vez de aproximada.
 */
export function computeGain(entries: SavingsEntry[], currentValueCents: number | null): GainResult {
  const usdDeposits = entries.filter((e) => e.currency === 'USD' && e.kind === 'deposit')
  const missingRateCount = usdDeposits.filter((e) => e.rateToMainCents == null).length

  if (missingRateCount > 0 || currentValueCents == null) {
    return { costArsCents: null, gainCents: null, missingRateCount }
  }

  let usdCostCents = 0 // Costo en ARS de los USD depositados.
  let usdUnitsCents = 0 // USD depositados, en centavos de USD.
  for (const entry of usdDeposits) {
    usdCostCents += Math.round((entry.cents * entry.rateToMainCents!) / 100)
    usdUnitsCents += entry.cents
  }
  const avgRateCentsPerUsd = usdUnitsCents > 0 ? Math.round((usdCostCents * 100) / usdUnitsCents) : null

  let costArsCents = 0
  for (const entry of entries) {
    if (entry.currency === 'ARS') {
      costArsCents += entry.kind === 'deposit' ? entry.cents : -entry.cents
    } else if (entry.kind === 'deposit') {
      costArsCents += Math.round((entry.cents * entry.rateToMainCents!) / 100)
    } else if (avgRateCentsPerUsd != null) {
      // Retiro: se descuenta al precio promedio de compra, no a uno propio (no lo tiene).
      costArsCents -= Math.round((entry.cents * avgRateCentsPerUsd) / 100)
    }
  }

  return { costArsCents, gainCents: currentValueCents - costArsCents, missingRateCount: 0 }
}

export interface BucketSummary {
  bucket: SavingsBucket
  entries: SavingsEntry[]
  net: CurrencyNet
  valueCents: number | null
  gain: GainResult
}

export function summarizeBucket(bucket: SavingsBucket, allEntries: SavingsEntry[], usdRateCents: number | null): BucketSummary {
  const entries = allEntries.filter((e) => e.bucket_id === bucket.id)
  const net = netByCurrency(entries)
  const valueCents = valueInMainCents(net, usdRateCents)
  const gain = computeGain(entries, valueCents)
  return { bucket, entries, net, valueCents, gain }
}

export interface PortfolioSummary {
  perBucket: BucketSummary[]
  totalNet: CurrencyNet
  totalValueCents: number | null
  totalGain: GainResult
}

export function summarizePortfolio(
  buckets: SavingsBucket[],
  entries: SavingsEntry[],
  usdRateCents: number | null,
): PortfolioSummary {
  const perBucket = buckets.map((b) => summarizeBucket(b, entries, usdRateCents))
  const totalNet = netByCurrency(entries)
  const totalValueCents = valueInMainCents(totalNet, usdRateCents)
  const totalGain = computeGain(entries, totalValueCents)
  return { perBucket, totalNet, totalValueCents, totalGain }
}
