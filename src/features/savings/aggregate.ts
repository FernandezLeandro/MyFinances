/**
 * Agregación de Patrimonio — funciones puras, separadas de la capa de red a propósito: el cálculo
 * depende de la cotización en vivo (`fx/api.ts`) y de los aportes (`savings/api.ts`), y así se puede
 * verificar con números a mano sin levantar la app.
 *
 * Cada activo tiene su propia escala (`decimals`: 2 para dinero/acciones, 8 para cripto). Todo lo
 * de acá opera en unidades enteras en esa escala — la misma disciplina de "nunca floats" que rige
 * el resto de la plata en Saldo, sólo que el factor de escala ya no está fijo en 100.
 */
import { centsFromNumeric, unitsFromNumeric } from '@/lib/money'
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'
import type { SavingsBucket, SavingsEntry } from './api'

export interface AssetNet {
  assetId: string
  /** Cantidad neta (depósitos − retiros), en la escala de `decimals` del activo. */
  quantityUnits: number
}

export function netByAsset(entries: SavingsEntry[], assets: Asset[]): AssetNet[] {
  const decimalsByAsset = new Map(assets.map((a) => [a.id, a.decimals]))
  const totals = new Map<string, number>()

  for (const entry of entries) {
    const decimals = decimalsByAsset.get(entry.asset_id) ?? 2
    const units = unitsFromNumeric(entry.amount, decimals)
    const signed = entry.kind === 'deposit' ? units : -units
    totals.set(entry.asset_id, (totals.get(entry.asset_id) ?? 0) + signed)
  }

  return [...totals.entries()].map(([assetId, quantityUnits]) => ({ assetId, quantityUnits }))
}

/**
 * Valor actual en ARS. Por cada activo con saldo ≠ 0 hace falta su precio EN VIVO (no el de compra
 * de cada aporte, ese sólo importa para el costo) — si falta el precio de cualquiera de los activos
 * en tenencia, el total completo queda `null`: mostrar un total parcial sería mentir.
 */
export function valueInMainCents(nets: AssetNet[], assets: Asset[], prices: Map<string, AssetPrice>): number | null {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  let total = 0

  for (const net of nets) {
    if (net.quantityUnits === 0) continue
    const asset = assetById.get(net.assetId)
    if (!asset) continue
    const price = prices.get(net.assetId)
    if (!price || price.priceArsCents == null) return null
    total += Math.round((net.quantityUnits * price.priceArsCents) / 10 ** asset.decimals)
  }

  return total
}

export interface GainResult {
  costArsCents: number | null
  gainCents: number | null
  /** Depósitos en un activo distinto de ARS sin cotización de compra cargada. */
  missingRateCount: number
}

/**
 * Ganancia = valor actual − costo de adquisición. El costo de un depósito en ARS es su propio
 * importe (no hay riesgo de cambio); el de cualquier otro activo es `cantidad × rate_to_main` (lo
 * que costó en ARS ese día). Sólo los DEPÓSITOS necesitan esa cotización — un retiro no "compra"
 * nada, así que reduce el costo al precio promedio de compra de ESE activo, sin pedirle al usuario
 * un dato que no tiene sentido para esa operación.
 *
 * Si falta la cotización en algún depósito, o no hay precio en vivo para valuar el total, la
 * ganancia queda explícitamente no disponible en vez de aproximada.
 */
export function computeGain(entries: SavingsEntry[], assets: Asset[], currentValueCents: number | null): GainResult {
  const assetById = new Map(assets.map((a) => [a.id, a]))

  const nonArsDeposits = entries.filter((e) => e.kind === 'deposit' && assetById.get(e.asset_id)?.symbol !== 'ARS')
  const missingRateCount = nonArsDeposits.filter((e) => e.rate_to_main == null).length

  if (missingRateCount > 0 || currentValueCents == null) {
    return { costArsCents: null, gainCents: null, missingRateCount }
  }

  // Costo y cantidad comprada por activo, para poder sacar el precio promedio de cada uno y usarlo
  // en los retiros (que no traen su propia cotización).
  const costByAsset = new Map<string, number>()
  const unitsByAsset = new Map<string, number>()
  for (const entry of nonArsDeposits) {
    const asset = assetById.get(entry.asset_id)!
    const units = unitsFromNumeric(entry.amount, asset.decimals)
    const rateCents = centsFromNumeric(entry.rate_to_main!)
    const cost = Math.round((units * rateCents) / 10 ** asset.decimals)
    costByAsset.set(entry.asset_id, (costByAsset.get(entry.asset_id) ?? 0) + cost)
    unitsByAsset.set(entry.asset_id, (unitsByAsset.get(entry.asset_id) ?? 0) + units)
  }

  let costArsCents = 0
  for (const entry of entries) {
    const asset = assetById.get(entry.asset_id)
    if (!asset) continue
    const units = unitsFromNumeric(entry.amount, asset.decimals)

    if (asset.symbol === 'ARS') {
      costArsCents += entry.kind === 'deposit' ? units : -units
    } else if (entry.kind === 'deposit') {
      const rateCents = centsFromNumeric(entry.rate_to_main!)
      costArsCents += Math.round((units * rateCents) / 10 ** asset.decimals)
    } else {
      const totalCost = costByAsset.get(entry.asset_id)
      const totalUnits = unitsByAsset.get(entry.asset_id)
      if (totalCost === undefined || totalUnits === undefined || totalUnits === 0) continue
      const avgRateCents = Math.round((totalCost * 10 ** asset.decimals) / totalUnits)
      costArsCents -= Math.round((units * avgRateCents) / 10 ** asset.decimals)
    }
  }

  return { costArsCents, gainCents: currentValueCents - costArsCents, missingRateCount: 0 }
}

export interface BucketSummary {
  bucket: SavingsBucket
  entries: SavingsEntry[]
  nets: AssetNet[]
  valueCents: number | null
  gain: GainResult
}

export function summarizeBucket(
  bucket: SavingsBucket,
  allEntries: SavingsEntry[],
  assets: Asset[],
  prices: Map<string, AssetPrice>,
): BucketSummary {
  const entries = allEntries.filter((e) => e.bucket_id === bucket.id)
  const nets = netByAsset(entries, assets)
  const valueCents = valueInMainCents(nets, assets, prices)
  const gain = computeGain(entries, assets, valueCents)
  return { bucket, entries, nets, valueCents, gain }
}

export interface PortfolioSummary {
  perBucket: BucketSummary[]
  totalNets: AssetNet[]
  totalValueCents: number | null
  totalGain: GainResult
}

export function summarizePortfolio(
  buckets: SavingsBucket[],
  entries: SavingsEntry[],
  assets: Asset[],
  prices: Map<string, AssetPrice>,
): PortfolioSummary {
  const perBucket = buckets.map((b) => summarizeBucket(b, entries, assets, prices))
  const totalNets = netByAsset(entries, assets)
  const totalValueCents = valueInMainCents(totalNets, assets, prices)
  const totalGain = computeGain(entries, assets, totalValueCents)
  return { perBucket, totalNets, totalValueCents, totalGain }
}
