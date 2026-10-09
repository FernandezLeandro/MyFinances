/**
 * Agregación de Inversiones — funciones puras, separadas de la red a propósito: dependen de las
 * cotizaciones en vivo (`fx/api.ts`) y de las inversiones (`investments/api.ts`), y así se verifican
 * con números a mano.
 *
 * Todo se opera en enteros: pesos en centavos, cantidades en unidades enteras a la escala del activo
 * (`decimals`: 2 para ARS/USD, 8 para el resto). Nunca floats para guardar ni sumar plata.
 *
 * Modelo: cada inversión guarda lo que se PAGÓ en ARS (`amount`, el costo) y la cantidad REAL
 * recibida (`quantity`). El valor de hoy sale de esa cantidad × el precio actual, valuado a la
 * COMPRA del dólar (lo que te pagarían si vendés hoy):
 *  - ARS: vale lo que se puso, sin ganancia.
 *  - USD: cantidad × compra del dólar elegido al guardar (`fx_source` de la inversión; sólo USD lo guarda).
 *  - Mercado: cantidad × precio en USD del activo × compra del dólar del activo (`assets.fx_source`).
 * Ganancia = valor de hoy − costo. Es no realizada: todavía no se vendió (no hay Retiro).
 */
import { centsFromNumeric, unitsFromNumeric } from '@/lib/money'
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'
import type { DollarType, ResolvedQuote } from '@/features/fx/quotes'
import type { Investment } from './api'
import { inRange, type DateRange, type Slot } from './period'

type Quotes = ReadonlyMap<DollarType, ResolvedQuote>
type Prices = ReadonlyMap<string, AssetPrice>

/** Mismo valor que `UNCATEGORIZED_ID` de `categories/api.ts` (ahí arrastra el cliente de Supabase,
 *  acá no hace falta): una inversión sin categoría (la borraron) se agrupa bajo «Sin categoría». */
export const UNCATEGORIZED = '__sin-categoria__'

// --- Ayudas del formulario ---------------------------------------------------------------------

/**
 * Cantidad que se espera recibir por `amountCents` pesos a `priceCents` pesos por unidad (la
 * cotización: por dólar, por USDT, por BTC…), en unidades enteras a `decimals`. Sólo SUGIERE el valor
 * del campo «Cantidad recibida»; lo que vale es lo que el usuario escribe (el exchange cobra
 * comisiones). `null` si falta un dato.
 */
export function estimateQuantity(amountCents: number, priceCents: number, decimals: number): number | null {
  if (!(amountCents > 0) || !(priceCents > 0)) return null
  return Math.round((amountCents / priceCents) * 10 ** decimals)
}

/** Pesos (centavos) que costó cada unidad entera de verdad: lo pagado ÷ lo recibido, o sea la
 *  cotización efectiva (con comisión incluida). `null` si no hay cantidad. */
export function effectiveRateCents(amountCents: number, quantityUnits: number, decimals: number): number | null {
  if (!(amountCents > 0) || !(quantityUnits > 0)) return null
  return Math.round((amountCents * 10 ** decimals) / quantityUnits)
}

// --- Valuación -----------------------------------------------------------------------------------

export function costCents(inv: Investment): number {
  return centsFromNumeric(inv.amount)
}

/** Valor de hoy de una inversión, en centavos de ARS. `null` si falta un precio o una cotización. */
export function entryValueCents(inv: Investment, asset: Asset | undefined, prices: Prices, quotes: Quotes): number | null {
  if (!asset) return null
  if (asset.symbol === 'ARS') return costCents(inv)

  const units = unitsFromNumeric(inv.quantity, asset.decimals)
  if (asset.symbol === 'USD') {
    const quote = inv.fx_source ? quotes.get(inv.fx_source) : undefined
    return quote ? Math.round((units * quote.buyCents) / 10 ** asset.decimals) : null
  }

  const priceUsd = prices.get(asset.id)?.priceUsd
  const quote = quotes.get(asset.fx_source)
  if (priceUsd == null || !quote) return null
  return Math.round((units * priceUsd * quote.buyCents) / 10 ** asset.decimals)
}

export interface Summary {
  investedCents: number
  /** `null` si a alguna inversión del conjunto le falta cotización: un total parcial engaña. */
  valueCents: number | null
  gainCents: number | null
  /** Sobre lo invertido FUERA de pesos (ARS no gana ni pierde). `null` sin nada que medir. */
  gainPct: number | null
}

function gainPct(gainCents: number | null, costNonArsCents: number): number | null {
  return gainCents == null || costNonArsCents <= 0 ? null : (gainCents / costNonArsCents) * 100
}

export function summarize(invs: readonly Investment[], assets: readonly Asset[], prices: Prices, quotes: Quotes): Summary {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  let invested = 0
  let costNonArs = 0
  let value: number | null = 0

  for (const inv of invs) {
    const cost = costCents(inv)
    invested += cost
    if (assetById.get(inv.asset_id)?.symbol !== 'ARS') costNonArs += cost
    const v = entryValueCents(inv, assetById.get(inv.asset_id), prices, quotes)
    value = value == null || v == null ? null : value + v
  }

  const gain = value == null ? null : value - invested
  return { investedCents: invested, valueCents: value, gainCents: gain, gainPct: gainPct(gain, costNonArs) }
}

// --- Filtros -------------------------------------------------------------------------------------

/** Sin categorías elegidas = todas. */
export function filterInvestments(
  invs: readonly Investment[],
  filter: { categoryIds: readonly string[]; range: DateRange | null },
): Investment[] {
  const ids = new Set(filter.categoryIds)
  return invs.filter(
    (inv) => inRange(inv.occurred_on, filter.range) && (ids.size === 0 || ids.has(inv.category_id ?? UNCATEGORIZED)),
  )
}

// --- Posiciones ----------------------------------------------------------------------------------

export interface Position {
  assetId: string
  symbol: string
  name: string
  decimals: number
  /** Cantidad real que se tiene: suma exacta de lo recibido. */
  quantityUnits: number
  costCents: number
  valueCents: number | null
  gainCents: number | null
  gainPct: number | null
  /** Pesos por unidad entera, hoy (valor ÷ cantidad). `null` sin valor. */
  unitPriceCents: number | null
  isArs: boolean
}

/** Una fila por activo (lo que ya tenés, sumando todas las compras), de mayor a menor valor. */
export function positionsByAsset(invs: readonly Investment[], assets: readonly Asset[], prices: Prices, quotes: Quotes): Position[] {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const groups = new Map<string, Investment[]>()
  for (const inv of invs) groups.set(inv.asset_id, [...(groups.get(inv.asset_id) ?? []), inv])

  const positions: Position[] = []
  for (const [assetId, group] of groups) {
    const asset = assetById.get(assetId)
    if (!asset) continue
    const quantityUnits = group.reduce((sum, inv) => sum + unitsFromNumeric(inv.quantity, asset.decimals), 0)
    const s = summarize(group, assets, prices, quotes)
    const isArs = asset.symbol === 'ARS'
    positions.push({
      assetId,
      symbol: asset.symbol,
      name: asset.name,
      decimals: asset.decimals,
      quantityUnits,
      costCents: s.investedCents,
      valueCents: s.valueCents,
      gainCents: isArs ? null : s.gainCents,
      gainPct: isArs ? null : s.gainPct,
      unitPriceCents: s.valueCents == null || quantityUnits <= 0 ? null : Math.round((s.valueCents * 10 ** asset.decimals) / quantityUnits),
      isArs,
    })
  }

  return positions.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1))
}

// --- Por categoría -------------------------------------------------------------------------------

export interface CategorySlice {
  categoryId: string
  name: string
  color: string | null
  investedCents: number
  valueCents: number | null
  gainCents: number | null
}

/** Para el donut y la leyenda: lo invertido, el valor y la ganancia de cada categoría, de mayor a menor. */
export function byCategory(
  invs: readonly Investment[],
  categories: readonly { id: string; name: string; color: string }[],
  assets: readonly Asset[],
  prices: Prices,
  quotes: Quotes,
): CategorySlice[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, Investment[]>()
  for (const inv of invs) {
    const key = inv.category_id && categoryById.has(inv.category_id) ? inv.category_id : UNCATEGORIZED
    groups.set(key, [...(groups.get(key) ?? []), inv])
  }

  return [...groups.entries()]
    .map(([categoryId, group]) => {
      const s = summarize(group, assets, prices, quotes)
      const category = categoryById.get(categoryId)
      return {
        categoryId,
        name: category?.name ?? 'Sin categoría',
        color: category?.color ?? null,
        investedCents: s.investedCents,
        valueCents: s.valueCents,
        gainCents: s.gainCents,
      }
    })
    .sort((a, b) => b.investedCents - a.investedCents)
}

// --- Gráfico -------------------------------------------------------------------------------------

/** Lo invertido (centavos de ARS) en cada barra del gráfico. */
export function investedBySlot(invs: readonly Investment[], slots: readonly Slot[]): number[] {
  return slots.map((slot) =>
    invs.reduce((sum, inv) => (inRange(inv.occurred_on, slot) ? sum + costCents(inv) : sum), 0),
  )
}
