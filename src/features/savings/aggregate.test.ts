import { describe, expect, it } from 'vitest'
import { makeAsset, makeBucket, makeEntry, priceMap } from '@/test/factories'
import { computeGain, netByAsset, summarizePortfolio, valueByAsset } from './aggregate'

describe('netByAsset', () => {
  it('suma depósitos, resta retiros, y respeta escalas distintas en la misma lista', () => {
    const assets = [makeAsset({ id: 'ars', symbol: 'ARS', decimals: 2 }), makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const entries = [
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '100.00' }),
      makeEntry({ asset_id: 'ars', kind: 'withdrawal', amount: '30.00' }),
      makeEntry({ asset_id: 'btc', kind: 'deposit', amount: '0.01500000' }),
    ]

    const nets = netByAsset(entries, assets)

    expect(nets).toEqual(
      expect.arrayContaining([
        { assetId: 'ars', quantityUnits: 7000 }, // (100.00 - 30.00) * 100
        { assetId: 'btc', quantityUnits: 1_500_000 }, // 0.015 * 10**8
      ]),
    )
  })

  it('un asset_id que no está en `assets` cae al default de 2 decimales', () => {
    const nets = netByAsset([makeEntry({ asset_id: 'desconocido', kind: 'deposit', amount: '10.00' })], [])
    expect(nets).toEqual([{ assetId: 'desconocido', quantityUnits: 1000 }])
  })

  it('un neto de 0 SÍ aparece en la salida — filtrarlo es responsabilidad de valueByAsset', () => {
    const entries = [
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '50.00' }),
      makeEntry({ asset_id: 'ars', kind: 'withdrawal', amount: '50.00' }),
    ]
    expect(netByAsset(entries, [makeAsset({ id: 'ars', symbol: 'ARS' })])).toEqual([{ assetId: 'ars', quantityUnits: 0 }])
  })
})

describe('valueByAsset', () => {
  it('devuelve null si falta el precio de CUALQUIER activo en tenencia — la regla estrella', () => {
    const assets = [makeAsset({ id: 'ars', symbol: 'ARS' }), makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const nets = [
      { assetId: 'ars', quantityUnits: 1000 },
      { assetId: 'btc', quantityUnits: 500 },
    ]
    // btc no está en el mapa de precios.
    expect(valueByAsset(nets, assets, priceMap({ ars: 100 }))).toBeNull()
  })

  it('pero si el activo SIN precio tiene neto 0, no anula nada — el continue va antes del chequeo de precio', () => {
    const assets = [makeAsset({ id: 'ars', symbol: 'ARS' }), makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const nets = [
      { assetId: 'ars', quantityUnits: 1000 },
      { assetId: 'btc', quantityUnits: 0 }, // sin precio en el mapa, pero neto 0 — no debería importar
    ]
    expect(valueByAsset(nets, assets, priceMap({ ars: 100 }))).toEqual([{ assetId: 'ars', valueCents: 1000 }])
  })

  it('un activo con neto ≠ 0 que no existe en `assets` se saltea en silencio, no devuelve null', () => {
    const nets = [{ assetId: 'no-existe', quantityUnits: 500 }]
    expect(valueByAsset(nets, [], priceMap({}))).toEqual([])
  })

  it('escala correctamente una tenencia de cripto con 8 decimales', () => {
    // 0,015 BTC a $1.000.000,00 ARS por BTC → $15.000,00 (1.500.000 centavos).
    const assets = [makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const nets = [{ assetId: 'btc', quantityUnits: 1_500_000 }]
    expect(valueByAsset(nets, assets, priceMap({ btc: 100_000_000 }))).toEqual([{ assetId: 'btc', valueCents: 1_500_000 }])
  })
})

describe('computeGain', () => {
  it('sólo ARS: costo = depósitos − retiros, ganancia = valor actual − costo', () => {
    const assets = [makeAsset({ id: 'ars', symbol: 'ARS' })]
    const entries = [
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '1000.00' }),
      makeEntry({ asset_id: 'ars', kind: 'withdrawal', amount: '200.00' }),
    ]
    expect(computeGain(entries, assets, 90_000)).toEqual({ costArsCents: 80_000, gainCents: 10_000, missingRateCount: 0 })
  })

  it('un depósito no-ARS sin rate_to_main deja todo en null, sin romper por el `!` no-null', () => {
    const assets = [makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const entries = [makeEntry({ asset_id: 'btc', kind: 'deposit', amount: '0.01', rate_to_main: null })]
    expect(computeGain(entries, assets, 12_345)).toEqual({ costArsCents: null, gainCents: null, missingRateCount: 1 })
  })

  it('los retiros usan el precio PROMEDIO de compra del activo, no el de ningún depósito puntual', () => {
    const assets = [makeAsset({ id: 'usd', symbol: 'USD', decimals: 2 })]
    const entries = [
      // 100 USD a 1000 ARS/USD, y otros 100 USD a 2000 ARS/USD → promedio ponderado 1500 ARS/USD.
      makeEntry({ asset_id: 'usd', kind: 'deposit', amount: '100.00', rate_to_main: '1000.00' }),
      makeEntry({ asset_id: 'usd', kind: 'deposit', amount: '100.00', rate_to_main: '2000.00' }),
      // Retira 50 USD: tiene que costar 50 × 1500 = 75.000 ARS, no 1000 ni 2000.
      makeEntry({ asset_id: 'usd', kind: 'withdrawal', amount: '50.00', rate_to_main: null }),
    ]
    // costo = 10.000.000 (dep1) + 20.000.000 (dep2) − 7.500.000 (retiro a precio promedio) = 22.500.000
    expect(computeGain(entries, assets, 25_000_000)).toEqual({
      costArsCents: 22_500_000,
      gainCents: 2_500_000,
      missingRateCount: 0,
    })
  })

  it('un aporte cuyo activo todavía no cargó (assetById.has === false) no cuenta como no-ARS ni rompe el costo', () => {
    // Ventana breve entre queries independientes: el aporte referencia un asset_id que `assets`
    // todavía no trae. No es "distinto de ARS" — es desconocido, y no debe figurar en ningún lado.
    const entries = [makeEntry({ asset_id: 'todavia-no-carga', kind: 'deposit', amount: '10.00', rate_to_main: null })]
    expect(computeGain(entries, [], 0)).toEqual({ costArsCents: 0, gainCents: 0, missingRateCount: 0 })
  })

  it('currentValueCents null anula costo y ganancia, pero missingRateCount sigue reportando el conteo real', () => {
    const assets = [makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })]
    const entries = [makeEntry({ asset_id: 'btc', kind: 'deposit', amount: '0.01', rate_to_main: null })]
    expect(computeGain(entries, assets, null)).toEqual({ costArsCents: null, gainCents: null, missingRateCount: 1 })
  })

  it('un retiro de un activo sin ningún depósito previo se saltea sin romper', () => {
    const assets = [makeAsset({ id: 'usd', symbol: 'USD', decimals: 2 })]
    const entries = [makeEntry({ asset_id: 'usd', kind: 'withdrawal', amount: '50.00', rate_to_main: null })]
    expect(computeGain(entries, assets, 5_000)).toEqual({ costArsCents: 0, gainCents: 5_000, missingRateCount: 0 })
  })
})

describe('summarizeBucket / summarizePortfolio', () => {
  it('include_in_total: false sale de los totales pero igual aparece en perBucket con su propio valor y ganancia', () => {
    const ars = makeAsset({ id: 'ars', symbol: 'ARS' })
    const bucketA = makeBucket({ id: 'a', include_in_total: true })
    const bucketB = makeBucket({ id: 'b', include_in_total: false })
    const entries = [
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '100.00', bucket_id: 'a' }),
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '50.00', bucket_id: 'b' }),
    ]
    const prices = priceMap({ ars: 100 }) // ARS vale 1 por definición (100 centavos por unidad de escala)

    const portfolio = summarizePortfolio([bucketA, bucketB], entries, [ars], prices)

    expect(portfolio.perBucket.find((b) => b.bucket.id === 'a')?.valueCents).toBe(10_000)
    expect(portfolio.perBucket.find((b) => b.bucket.id === 'b')?.valueCents).toBe(5_000)
    // El total sólo ve al bucket incluido — el excluido no infla la cifra grande.
    expect(portfolio.totalValueCents).toBe(10_000)
  })

  it('un bucket incluido sin precio anula el total, pero el bucket excluido sigue mostrando el suyo', () => {
    const btc = makeAsset({ id: 'btc', symbol: 'BTC', decimals: 8 })
    const ars = makeAsset({ id: 'ars', symbol: 'ARS' })
    const bucketA = makeBucket({ id: 'a', include_in_total: true }) // tiene BTC, sin precio
    const bucketB = makeBucket({ id: 'b', include_in_total: false }) // tiene ARS, con precio
    const entries = [
      makeEntry({ asset_id: 'btc', kind: 'deposit', amount: '0.01', bucket_id: 'a', rate_to_main: '30000000.00' }),
      makeEntry({ asset_id: 'ars', kind: 'deposit', amount: '10.00', bucket_id: 'b' }),
    ]
    const prices = priceMap({ ars: 100 }) // btc deliberadamente ausente del mapa

    const portfolio = summarizePortfolio([bucketA, bucketB], entries, [btc, ars], prices)

    const summaryA = portfolio.perBucket.find((b) => b.bucket.id === 'a')!
    const summaryB = portfolio.perBucket.find((b) => b.bucket.id === 'b')!

    expect(summaryA.valueCents).toBeNull()
    expect(summaryA.gain).toEqual({ costArsCents: null, gainCents: null, missingRateCount: 0 })
    expect(summaryB.valueCents).toBe(1_000)

    expect(portfolio.totalValueCents).toBeNull()
    expect(portfolio.totalGain.costArsCents).toBeNull()
  })
})
