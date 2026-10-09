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
 *
 * Todo se calcula en ARS (centavos) o, con `currency: 'USD'`, en dólares (centavos): cada inversión
 * se convierte con SU dólar (`usdRateCents`) antes de sumar, no con uno global.
 */
import { centsFromNumeric, unitsFromNumeric, type Currency } from '@/lib/money'
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'
import type { DollarQuote, DollarType } from '@/features/fx/quotes'
import type { Investment } from './api'
import { inRange, type DateRange, type Slot } from './period'

type Quotes = ReadonlyMap<DollarType, DollarQuote>
type Prices = ReadonlyMap<string, AssetPrice>

/** El dólar con el que se pasa a USD lo invertido en pesos (no guarda ninguno propio). */
const ARS_DOLLAR: DollarType = 'oficial'

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

/** Centavos de ARS por USD con los que se pasa esta inversión a dólares: la COMPRA del mismo dólar que
 *  ya la valúa (ARS: el oficial; USD: el elegido al guardar; mercado: el del activo). */
export function usdRateCents(inv: Investment, asset: Asset | undefined, quotes: Quotes): number | null {
  if (!asset) return null
  const type = asset.symbol === 'ARS' ? ARS_DOLLAR : asset.symbol === 'USD' ? inv.fx_source : asset.fx_source
  return type ? (quotes.get(type)?.buyCents ?? null) : null
}

/** Pasa centavos de ARS de esta inversión a la moneda pedida. `null` si falta la cotización. */
function convert(arsCents: number | null, inv: Investment, asset: Asset | undefined, quotes: Quotes, currency: Currency): number | null {
  if (arsCents == null || currency === 'ARS') return arsCents
  const rate = usdRateCents(inv, asset, quotes)
  return rate == null ? null : Math.round((arsCents * 100) / rate)
}

/** Lo pagado por una inversión, en la moneda pedida. */
export function costIn(inv: Investment, asset: Asset | undefined, quotes: Quotes, currency: Currency): number | null {
  return convert(costCents(inv), inv, asset, quotes, currency)
}

export interface Summary {
  /** `null` sólo en USD, si a alguna inversión le falta cotización. */
  investedCents: number | null
  /** `null` si a alguna inversión del conjunto le falta cotización: un total parcial engaña. */
  valueCents: number | null
  gainCents: number | null
  /** Sobre lo invertido FUERA de pesos (ARS no gana ni pierde). `null` sin nada que medir. */
  gainPct: number | null
}

function gainPct(gainCents: number | null, costNonArsCents: number): number | null {
  return gainCents == null || costNonArsCents <= 0 ? null : (gainCents / costNonArsCents) * 100
}

export function summarize(
  invs: readonly Investment[],
  assets: readonly Asset[],
  prices: Prices,
  quotes: Quotes,
  currency: Currency = 'ARS',
): Summary {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  let invested: number | null = 0
  let costNonArs = 0
  let value: number | null = 0

  for (const inv of invs) {
    const asset = assetById.get(inv.asset_id)
    const cost = costIn(inv, asset, quotes, currency)
    invested = invested == null || cost == null ? null : invested + cost
    if (cost != null && asset?.symbol !== 'ARS') costNonArs += cost
    const v = convert(entryValueCents(inv, asset, prices, quotes), inv, asset, quotes, currency)
    value = value == null || v == null ? null : value + v
  }

  const gain = value == null || invested == null ? null : value - invested
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
  costCents: number | null
  valueCents: number | null
  gainCents: number | null
  gainPct: number | null
  /** Moneda de la pantalla por unidad entera, hoy (valor ÷ cantidad). `null` sin valor. */
  unitPriceCents: number | null
  isArs: boolean
  /** Valor de hoy en centavos de USD (0 sin cotización): con lo que se reparte el donut por activo. */
  weightUsdCents: number
}

/** Una fila por activo (lo que ya tenés, sumando todas las compras), de mayor a menor valor. */
export function positionsByAsset(
  invs: readonly Investment[],
  assets: readonly Asset[],
  prices: Prices,
  quotes: Quotes,
  currency: Currency = 'ARS',
): Position[] {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const groups = new Map<string, Investment[]>()
  for (const inv of invs) groups.set(inv.asset_id, [...(groups.get(inv.asset_id) ?? []), inv])

  const positions: Position[] = []
  for (const [assetId, group] of groups) {
    const asset = assetById.get(assetId)
    if (!asset) continue
    const quantityUnits = group.reduce((sum, inv) => sum + unitsFromNumeric(inv.quantity, asset.decimals), 0)
    const s = summarize(group, assets, prices, quotes, currency)
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
      weightUsdCents: (currency === 'USD' ? s : summarize(group, assets, prices, quotes, 'USD')).valueCents ?? 0,
    })
  }

  return positions.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1))
}

// --- Reparto (donuts) ----------------------------------------------------------------------------

/** Una porción de un donut: lo invertido, el valor y la ganancia en la moneda pedida, y el peso con el
 *  que se reparte (valor de hoy en USD: el peso que se devalúa no mueve las porciones). */
export interface Share {
  id: string
  name: string
  color: string | null
  weightUsdCents: number
  investedCents: number | null
  valueCents: number | null
  gainCents: number | null
}

/** Para el donut por categoría y su leyenda, de mayor a menor peso. */
export function byCategory(
  invs: readonly Investment[],
  categories: readonly { id: string; name: string; color: string }[],
  assets: readonly Asset[],
  prices: Prices,
  quotes: Quotes,
  currency: Currency = 'ARS',
): Share[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, Investment[]>()
  for (const inv of invs) {
    const key = inv.category_id && categoryById.has(inv.category_id) ? inv.category_id : UNCATEGORIZED
    groups.set(key, [...(groups.get(key) ?? []), inv])
  }

  return [...groups.entries()]
    .map(([id, group]) => {
      const s = summarize(group, assets, prices, quotes, currency)
      const category = categoryById.get(id)
      return {
        id,
        name: category?.name ?? 'Sin categoría',
        color: category?.color ?? null,
        weightUsdCents: (currency === 'USD' ? s : summarize(group, assets, prices, quotes, 'USD')).valueCents ?? 0,
        investedCents: s.investedCents,
        valueCents: s.valueCents,
        gainCents: s.gainCents,
      }
    })
    .sort((a, b) => b.weightUsdCents - a.weightUsdCents)
}

/** Para el donut por activo: una porción por posición, de mayor a menor peso. El color lo pone quien dibuja. */
export function sharesByAsset(positions: readonly Position[]): Share[] {
  return positions
    .map((p) => ({
      id: p.assetId,
      name: p.symbol,
      color: null,
      weightUsdCents: p.weightUsdCents,
      investedCents: p.costCents,
      valueCents: p.valueCents,
      gainCents: p.gainCents,
    }))
    .sort((a, b) => b.weightUsdCents - a.weightUsdCents)
}

/** Con más de `max` porciones deja las `max - 1` mayores y junta el resto en «Otros» (el donut tiene
 *  `max` colores). Un total con alguna parte `null` queda `null`. */
export function topWithOthers(shares: readonly Share[], max = 6): Share[] {
  if (shares.length <= max) return [...shares]
  const rest = shares.slice(max - 1)
  const sum = (pick: (s: Share) => number | null) =>
    rest.reduce<number | null>((total, s) => {
      const v = pick(s)
      return total == null || v == null ? null : total + v
    }, 0)
  return [
    ...shares.slice(0, max - 1),
    {
      id: '__otros__',
      name: 'Otros',
      color: null,
      weightUsdCents: rest.reduce((total, s) => total + s.weightUsdCents, 0),
      investedCents: sum((s) => s.investedCents),
      valueCents: sum((s) => s.valueCents),
      gainCents: sum((s) => s.gainCents),
    },
  ]
}

// --- Gráfico -------------------------------------------------------------------------------------

/** Lo invertido en cada barra del gráfico, en la moneda pedida. Una inversión sin cotización no suma. */
export function investedBySlot(
  invs: readonly Investment[],
  slots: readonly Slot[],
  assets: readonly Asset[],
  quotes: Quotes,
  currency: Currency = 'ARS',
): number[] {
  const assetById = new Map(assets.map((a) => [a.id, a]))
  return slots.map((slot) =>
    invs.reduce(
      (sum, inv) => (inRange(inv.occurred_on, slot) ? sum + (costIn(inv, assetById.get(inv.asset_id), quotes, currency) ?? 0) : sum),
      0,
    ),
  )
}
