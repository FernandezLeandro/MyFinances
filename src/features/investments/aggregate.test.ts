import { describe, expect, it } from 'vitest'
import { makeAsset, makeInvestment, priceMap, quoteMap } from '@/test/factories'
import {
  byCategory,
  effectiveRateCents,
  entryValueCents,
  estimateQuantity,
  filterInvestments,
  investedBySlot,
  positionsByAsset,
  sharesByAsset,
  summarize,
  topWithOthers,
  UNCATEGORIZED,
  usdRateCents,
} from './aggregate'
import { slotsFor } from './period'

const ARS = makeAsset({ id: 'ars', symbol: 'ARS', asset_class: 'fiat', decimals: 2 })
const USD = makeAsset({ id: 'usd', symbol: 'USD', asset_class: 'fiat', decimals: 2 })
const BTC = makeAsset({ id: 'btc', symbol: 'BTC', asset_class: 'crypto', decimals: 8, price_source: 'coingecko', fx_source: 'cripto' })
const MELI = makeAsset({ id: 'meli', symbol: 'MELI', asset_class: 'equity', decimals: 8, fx_source: 'contadoconliqui' })
const assets = [ARS, USD, BTC, MELI]

// [compra, venta] en centavos de ARS por USD.
const quotes = quoteMap({ blue: [153500, 155500], bolsa: [150000, 152000], cripto: [149000, 150000], contadoconliqui: [151000, 153000] })
const prices = priceMap({ btc: 100000, meli: null })

describe('estimateQuantity y effectiveRateCents', () => {
  it('USD: pesos ÷ cotización, en unidades a 2 decimales', () => {
    expect(estimateQuantity(15_500_000, 155_500, 2)).toBe(9968)
  })

  it('mercado: pesos ÷ pesos por unidad, a 8 decimales', () => {
    // 67.500 pesos a 150.000.000 pesos por BTC → 0,00045000 BTC.
    expect(estimateQuantity(6_750_000, 15_000_000_000, 8)).toBe(45_000)
  })

  it('sin cotización o importe no hay estimación', () => {
    expect(estimateQuantity(0, 155_500, 2)).toBeNull()
    expect(estimateQuantity(1000, 0, 2)).toBeNull()
  })

  it('el precio efectivo sale de lo pagado ÷ lo recibido (con la comisión adentro)', () => {
    // 155.000 pesos por US$ 100,00 → 1.550 pesos por dólar.
    expect(effectiveRateCents(15_500_000, 10_000, 2)).toBe(155_000)
    expect(effectiveRateCents(15_500_000, 0, 2)).toBeNull()
  })
})

describe('entryValueCents', () => {
  it('ARS vale lo que se puso', () => {
    const inv = makeInvestment({ asset_id: 'ars', amount: '100000.00', quantity: '100000.00' })
    expect(entryValueCents(inv, ARS, prices, quotes)).toBe(10_000_000)
  })

  it('USD se valúa a la COMPRA del dólar con el que se compró, no al global', () => {
    const inv = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })
    expect(entryValueCents(inv, USD, prices, quotes)).toBe(15_350_000)
    const mep = { ...inv, fx_source: 'bolsa' as const }
    expect(entryValueCents(mep, USD, prices, quotes)).toBe(15_000_000)
  })

  it('mercado: cantidad × precio USD × compra del dólar DEL ACTIVO', () => {
    const inv = makeInvestment({ asset_id: 'btc', amount: '67500.00', quantity: '0.00045000', buy_price: '150000000' })
    expect(entryValueCents(inv, BTC, prices, quotes)).toBe(6_705_000)
  })

  it('sin precio del activo, o sin cotización del dólar, es null', () => {
    const meli = makeInvestment({ asset_id: 'meli', amount: '1000.00', quantity: '1.00000000', buy_price: '1000' })
    expect(entryValueCents(meli, MELI, prices, quotes)).toBeNull()
    const usd = makeInvestment({ asset_id: 'usd', amount: '1000.00', quantity: '1.00', fx_source: 'oficial', buy_price: '1400' })
    expect(entryValueCents(usd, USD, prices, quotes)).toBeNull()
    expect(entryValueCents(usd, undefined, prices, quotes)).toBeNull()
  })
})

describe('summarize', () => {
  const ars = makeInvestment({ asset_id: 'ars', amount: '50000.00', quantity: '50000.00' })
  const usd = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })

  it('ganancia = valor de hoy − lo pagado; el % se mide sólo sobre lo que no es ARS', () => {
    const s = summarize([ars, usd], assets, prices, quotes)
    expect(s.investedCents).toBe(5_000_000 + 15_500_000)
    expect(s.valueCents).toBe(5_000_000 + 15_350_000)
    expect(s.gainCents).toBe(-150_000)
    expect(s.gainPct).toBeCloseTo((-150_000 / 15_500_000) * 100, 6)
  })

  it('sólo ARS: ganancia 0 y sin porcentaje', () => {
    const s = summarize([ars], assets, prices, quotes)
    expect(s.gainCents).toBe(0)
    expect(s.gainPct).toBeNull()
  })

  it('si a una le falta cotización, valor y ganancia quedan null (un total parcial engaña)', () => {
    const meli = makeInvestment({ asset_id: 'meli', amount: '1000.00', quantity: '1.00000000', buy_price: '1000' })
    const s = summarize([ars, meli], assets, prices, quotes)
    expect(s.investedCents).toBe(5_100_000)
    expect(s.valueCents).toBeNull()
    expect(s.gainCents).toBeNull()
  })

  it('sin inversiones todo es cero', () => {
    expect(summarize([], assets, prices, quotes)).toEqual({ investedCents: 0, valueCents: 0, gainCents: 0, gainPct: null })
  })
})

describe('positionsByAsset', () => {
  it('suma la cantidad exacta (sin drift a 8 decimales) y valúa cada compra con su propio dólar', () => {
    const a = makeInvestment({ asset_id: 'btc', amount: '1000.00', quantity: '0.10000000', buy_price: '10000' })
    const b = makeInvestment({ asset_id: 'btc', amount: '2000.00', quantity: '0.20000000', buy_price: '10000' })
    const [btc] = positionsByAsset([a, b], assets, prices, quotes)
    expect(btc.quantityUnits).toBe(30_000_000)
    expect(btc.costCents).toBe(300_000)
    // 0,3 BTC × US$ 100.000 × 1.490 = 44.700.000 pesos.
    expect(btc.valueCents).toBe(4_470_000_000)
    expect(btc.unitPriceCents).toBe(14_900_000_000)
  })

  it('USD comprado con dos dólares distintos queda en una sola posición', () => {
    const blue = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })
    const mep = makeInvestment({ asset_id: 'usd', amount: '151000.00', quantity: '100.00', fx_source: 'bolsa', buy_price: '1510' })
    const [usd] = positionsByAsset([blue, mep], assets, prices, quotes)
    expect(usd.quantityUnits).toBe(20_000)
    expect(usd.valueCents).toBe(15_350_000 + 15_000_000)
    expect(usd.gainCents).toBe(30_350_000 - 30_600_000)
  })

  it('ARS no muestra ganancia, y las posiciones van de mayor a menor valor', () => {
    const ars = makeInvestment({ asset_id: 'ars', amount: '1000.00', quantity: '1000.00' })
    const usd = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })
    const positions = positionsByAsset([ars, usd], assets, prices, quotes)
    expect(positions.map((p) => p.symbol)).toEqual(['USD', 'ARS'])
    expect(positions[1]).toMatchObject({ gainCents: null, gainPct: null, isArs: true })
  })

  it('sin precio la posición queda sin valor y va al final', () => {
    const meli = makeInvestment({ asset_id: 'meli', amount: '1000.00', quantity: '1.00000000', buy_price: '1000' })
    const ars = makeInvestment({ asset_id: 'ars', amount: '1000.00', quantity: '1000.00' })
    const positions = positionsByAsset([meli, ars], assets, prices, quotes)
    expect(positions.map((p) => p.symbol)).toEqual(['ARS', 'MELI'])
    expect(positions[1]).toMatchObject({ valueCents: null, unitPriceCents: null })
  })
})

describe('filterInvestments', () => {
  const a = makeInvestment({ asset_id: 'ars', amount: '1.00', quantity: '1.00', category_id: 'c1', occurred_on: '2026-10-06' })
  const b = makeInvestment({ asset_id: 'ars', amount: '2.00', quantity: '2.00', category_id: 'c2', occurred_on: '2026-09-30' })
  const c = makeInvestment({ asset_id: 'ars', amount: '3.00', quantity: '3.00', category_id: null, occurred_on: '2026-10-07' })
  const all = [a, b, c]

  it('sin categorías elegidas entran todas; con rango, sólo las de esas fechas', () => {
    expect(filterInvestments(all, { categoryIds: [], range: null })).toHaveLength(3)
    expect(filterInvestments(all, { categoryIds: [], range: { from: '2026-10-01', to: '2026-10-31' } })).toEqual([a, c])
  })

  it('filtra por categoría, incluida «Sin categoría»', () => {
    expect(filterInvestments(all, { categoryIds: ['c2'], range: null })).toEqual([b])
    expect(filterInvestments(all, { categoryIds: ['c1', UNCATEGORIZED], range: null })).toEqual([a, c])
  })
})

describe('byCategory', () => {
  it('agrupa por categoría de mayor a menor invertido; la borrada cae en «Sin categoría»', () => {
    const cats = [
      { id: 'c1', name: 'Ahorros', color: '#1D8F7E' },
      { id: 'c2', name: 'Jubilación', color: '#6A5BB8' },
    ]
    const invs = [
      makeInvestment({ asset_id: 'ars', amount: '1000.00', quantity: '1000.00', category_id: 'c1' }),
      makeInvestment({ asset_id: 'ars', amount: '5000.00', quantity: '5000.00', category_id: 'c2' }),
      makeInvestment({ asset_id: 'ars', amount: '200.00', quantity: '200.00', category_id: 'borrada' }),
    ]
    const slices = byCategory(invs, cats, assets, prices, quoteMap({ oficial: [140000, 141000] }))
    expect(slices.map((s) => [s.name, s.investedCents])).toEqual([
      ['Jubilación', 500_000],
      ['Ahorros', 100_000],
      ['Sin categoría', 20_000],
    ])
    expect(slices[2].color).toBeNull()
  })
})

describe('investedBySlot', () => {
  it('suma lo invertido en cada barra del año', () => {
    const invs = [
      makeInvestment({ asset_id: 'ars', amount: '100.00', quantity: '100.00', occurred_on: '2026-01-31' }),
      makeInvestment({ asset_id: 'ars', amount: '50.00', quantity: '50.00', occurred_on: '2026-02-01' }),
      makeInvestment({ asset_id: 'ars', amount: '25.00', quantity: '25.00', occurred_on: '2026-02-28' }),
    ]
    const slots = slotsFor('year', new Date(2026, 5, 1), null)
    expect(investedBySlot(invs, slots, assets, quotes).slice(0, 3)).toEqual([10_000, 7_500, 0])
  })
})

// --- En dólares: cada inversión con SU dólar ----------------------------------------------------------
describe('en USD (cada inversión con su dólar)', () => {
  // Regresión: «En dólares» y el modo USD dividían todo por UN dólar global (el «Dólar en uso» del
  // perfil), así que un total en USD cambiaba al tocar Ajustes y no coincidía con la ganancia, que sí
  // usa el dólar de cada inversión.
  const quotesOf = quoteMap({ oficial: [140000, 141000], blue: [153500, 155500], bolsa: [150000, 152000], cripto: [149000, 150000] })
  const ars = makeInvestment({ asset_id: 'ars', amount: '14000.00', quantity: '14000.00' })
  const blue = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })
  const mep = makeInvestment({ asset_id: 'usd', amount: '151000.00', quantity: '100.00', fx_source: 'bolsa', buy_price: '1510' })

  it('usdRateCents: ARS usa el oficial, USD el elegido al guardar, mercado el del activo', () => {
    expect(usdRateCents(ars, ARS, quotesOf)).toBe(140000)
    expect(usdRateCents(blue, USD, quotesOf)).toBe(153500)
    expect(usdRateCents(mep, USD, quotesOf)).toBe(150000)
    const btc = makeInvestment({ asset_id: 'btc', amount: '1.00', quantity: '0.00000001', buy_price: '1' })
    expect(usdRateCents(btc, BTC, quotesOf)).toBe(149000)
    expect(usdRateCents(ars, undefined, quotesOf)).toBeNull()
    expect(usdRateCents(ars, ARS, quotes)).toBeNull() // sin oficial en el mapa
  })

  it('un dólar comprado a blue y otro a MEP valen cada uno US$ 100,00, y el costo se pasa con su propio dólar', () => {
    const s = summarize([blue, mep], assets, prices, quotesOf, 'USD')
    expect(s.valueCents).toBe(20_000)
    // 155.000 / 1.535 + 151.000 / 1.500 = 100,98 + 100,67 → ganancia = 200 − 201,65.
    expect(s.investedCents).toBe(Math.round((15_500_000 * 100) / 153_500) + Math.round((15_100_000 * 100) / 150_000))
    expect(s.gainCents).toBe(s.valueCents! - s.investedCents!)
  })

  it('ARS en USD no gana ni pierde: costo y valor salen con el mismo dólar', () => {
    const s = summarize([ars], assets, prices, quotesOf, 'USD')
    expect(s.valueCents).toBe(1_000) // 14.000 pesos al oficial de 1.400 = US$ 10
    expect(s.gainCents).toBe(0)
  })

  it('sin cotización de alguna inversión, todo el total en USD queda null (y en ARS no cambia nada)', () => {
    const s = summarize([ars, blue], assets, prices, quotes, 'USD') // `quotes` no tiene oficial
    expect(s).toMatchObject({ investedCents: null, valueCents: null, gainCents: null })
    expect(summarize([ars, blue], assets, prices, quotes).valueCents).toBe(1_400_000 + 15_350_000)
  })

  it('cada posición y porción lleva su peso en USD aunque se muestre en ARS', () => {
    const [usd] = positionsByAsset([blue], assets, prices, quotesOf)
    expect(usd.valueCents).toBe(15_350_000) // pesos
    expect(usd.weightUsdCents).toBe(10_000) // dólares
  })

  it('byCategory ordena por peso en USD, no por pesos', () => {
    const cats = [
      { id: 'c1', name: 'Pesos', color: '#1D8F7E' },
      { id: 'c2', name: 'Dólares', color: '#6A5BB8' },
    ]
    // 20.000.000 pesos (US$ 1.428,57 al oficial) vs US$ 100 → pesos gana por tamaño, y en USD también.
    const big = { ...ars, amount: '20000000.00', quantity: '20000000.00', category_id: 'c1' }
    const small = { ...blue, category_id: 'c2' }
    expect(byCategory([small, big], cats, assets, prices, quotesOf, 'USD').map((s) => s.name)).toEqual(['Pesos', 'Dólares'])
    // 1.000 pesos (US$ 0,71) vs US$ 100: en pesos la primera «pierde» por poco, en USD mucho más.
    const tiny = { ...ars, amount: '1000.00', quantity: '1000.00', category_id: 'c1' }
    const slices = byCategory([tiny, small], cats, assets, prices, quotesOf)
    expect(slices.map((s) => s.name)).toEqual(['Dólares', 'Pesos'])
    expect(slices[0].weightUsdCents).toBe(10_000)
  })

  it('investedBySlot en USD pasa cada inversión con su dólar', () => {
    const inv = { ...blue, occurred_on: '2026-01-31' }
    const slots = slotsFor('year', new Date(2026, 5, 1), null)
    expect(investedBySlot([inv], slots, assets, quotesOf, 'USD')[0]).toBe(Math.round((15_500_000 * 100) / 153_500))
  })
})

describe('topWithOthers', () => {
  const share = (id: number, weight: number) => ({
    id: `s${id}`,
    name: `S${id}`,
    color: null,
    weightUsdCents: weight,
    investedCents: weight,
    valueCents: weight,
    gainCents: 0,
  })
  const seven = [70, 60, 50, 40, 30, 20, 10].map((w, i) => share(i, w))

  it('con hasta 6 porciones no toca nada (un «Otros» de una sola sería ruido)', () => {
    expect(topWithOthers(seven.slice(0, 6))).toHaveLength(6)
    expect(topWithOthers(seven.slice(0, 6)).map((s) => s.name)).not.toContain('Otros')
  })

  it('con 7 deja las 5 mayores y junta las 2 chicas en «Otros»', () => {
    const out = topWithOthers(seven)
    expect(out.map((s) => s.name)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'Otros'])
    expect(out[5]).toMatchObject({ weightUsdCents: 30, investedCents: 30, valueCents: 30, gainCents: 0, color: null })
  })

  it('si a una de las que se juntan le falta valor, «Otros» queda sin valor', () => {
    const out = topWithOthers([...seven.slice(0, 6), { ...share(6, 5), valueCents: null }])
    expect(out[5].valueCents).toBeNull()
    expect(out[5].weightUsdCents).toBe(25)
  })
})

describe('sharesByAsset', () => {
  it('una porción por posición, de mayor a menor peso en USD', () => {
    const quotesOf = quoteMap({ oficial: [140000, 141000], blue: [153500, 155500] })
    const ars = makeInvestment({ asset_id: 'ars', amount: '1000.00', quantity: '1000.00' })
    const usd = makeInvestment({ asset_id: 'usd', amount: '155000.00', quantity: '100.00', fx_source: 'blue', buy_price: '1550' })
    const shares = sharesByAsset(positionsByAsset([ars, usd], assets, prices, quotesOf))
    expect(shares.map((s) => s.name)).toEqual(['USD', 'ARS'])
    expect(shares[0].weightUsdCents).toBe(10_000)
  })
})
