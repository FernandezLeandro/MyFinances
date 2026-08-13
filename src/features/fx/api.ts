import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfile, type FxSource } from '@/features/profile/api'
import { useAssetManualPrices, useAssets } from '@/features/assets/api'

interface DolarApiResponse {
  venta: number
  fechaActualizacion: string
}

/** dolarapi.com no pide API key y confirmado con CORS abierto (`Access-Control-Allow-Origin: *`). */
async function fetchDolarApi(casa: Exclude<FxSource, 'manual'>): Promise<DolarApiResponse> {
  const res = await fetch(`https://dolarapi.com/v1/dolares/${casa}`)
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`)
  return res.json()
}

type CoinGeckoResponse = Record<string, { ars: number; last_updated_at: number }>

/** CoinGecko: sin key, confirmado con CORS abierto. Devuelve el precio directo en ARS, sin pasar por el dólar. */
async function fetchCoinGeckoPrices(ids: string[]): Promise<CoinGeckoResponse> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=ars&include_last_updated_at=true`,
  )
  if (!res.ok) throw new Error(`coingecko respondió ${res.status}`)
  return res.json()
}

export interface UsdRate {
  /** Centavos de ARS por 1 USD. `null` si no hay ninguna cotización disponible (ni API ni manual). */
  rateCents: number | null
  updatedAt: string | null
  origin: 'api' | 'manual' | 'none'
  /** La API falló (o la fuente elegida es manual) y se está mostrando el respaldo cargado a mano. */
  isFallback: boolean
}

/**
 * Cotización del dólar para valuar Ahorros en ARS. Si `fx_source` del perfil es una casa de
 * dolarapi.com, la trae en vivo; si falla o la fuente es 'manual', cae al valor que el usuario cargó
 * en Ajustes. Nunca lanza — un dólar desactualizado es preferible a romper la pantalla de Ahorros.
 */
export function useUsdRate() {
  const { data: profile } = useProfile()
  const source = profile?.fxSource ?? 'blue'
  const isManualSource = source === 'manual'

  const apiQuery = useQuery({
    queryKey: ['usd-rate', source],
    queryFn: () => fetchDolarApi(source as Exclude<FxSource, 'manual'>),
    enabled: !isManualSource,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  const manual = {
    rateCents: profile?.usdRateManualCents ?? null,
    updatedAt: profile?.usdRateUpdatedAt ?? null,
  }

  const result: UsdRate = (() => {
    if (!isManualSource && apiQuery.data) {
      return {
        rateCents: Math.round(apiQuery.data.venta * 100),
        updatedAt: apiQuery.data.fechaActualizacion,
        origin: 'api',
        isFallback: false,
      }
    }
    if (manual.rateCents != null) {
      return { rateCents: manual.rateCents, updatedAt: manual.updatedAt, origin: 'manual', isFallback: !isManualSource }
    }
    return { rateCents: null, updatedAt: null, origin: 'none', isFallback: !isManualSource }
  })()

  return { ...result, isPending: !isManualSource && apiQuery.isPending && manual.rateCents == null }
}

export interface AssetPrice {
  /** Centavos de ARS por 1 unidad entera del activo. `null` si no hay ninguna cotización cargada. */
  priceArsCents: number | null
  origin: 'fixed' | 'api' | 'manual' | 'none'
  updatedAt: string | null
}

/**
 * Precio en vivo (o manual) de cada activo del catálogo, resuelto por `asset_id`. ARS vale 1 por
 * definición; USD reusa `useUsdRate` tal cual; cripto pega una sola vez a CoinGecko por todos los
 * activos con `price_source='coingecko'` juntos; el resto (equities, activos propios) lee el
 * override manual de esta cuenta. Nunca lanza — un precio faltante se resuelve como `null`, no como error.
 */
export function useAssetPrices() {
  const { data: assets } = useAssets()
  const { data: manualPrices } = useAssetManualPrices()
  const usdRate = useUsdRate()

  const cryptoIds = [
    ...new Set((assets ?? []).filter((a) => a.price_source === 'coingecko' && a.coingecko_id).map((a) => a.coingecko_id!)),
  ].sort()

  const cryptoQuery = useQuery({
    queryKey: ['crypto-prices', cryptoIds.join(',')],
    queryFn: () => fetchCoinGeckoPrices(cryptoIds),
    enabled: cryptoIds.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })

  // Memoizado: sin esto, `prices` es un Map con identidad nueva en CADA render, lo que rompe
  // cualquier `useMemo` que dependa de él más arriba (p.ej. `summarizePortfolio` en Ahorros.tsx
  // recalcula todo el agregado de ahorros en cada render en vez de cachear). Las dependencias
  // usan los campos primitivos de `usdRate`, no el objeto entero — `useUsdRate()` devuelve un
  // literal nuevo por render, así que depender de él completo también invalidaría el memo siempre.
  return useMemo(() => {
    const prices = new Map<string, AssetPrice>()
    for (const asset of assets ?? []) {
      if (asset.symbol === 'ARS') {
        prices.set(asset.id, { priceArsCents: 100, origin: 'fixed', updatedAt: null })
      } else if (asset.symbol === 'USD') {
        prices.set(asset.id, { priceArsCents: usdRate.rateCents, origin: usdRate.origin, updatedAt: usdRate.updatedAt })
      } else if (asset.price_source === 'coingecko' && asset.coingecko_id) {
        const quote = cryptoQuery.data?.[asset.coingecko_id]
        prices.set(asset.id, {
          priceArsCents: quote ? Math.round(quote.ars * 100) : null,
          origin: quote ? 'api' : 'none',
          updatedAt: quote ? new Date(quote.last_updated_at * 1000).toISOString() : null,
        })
      } else {
        const manual = manualPrices?.get(asset.id)
        if (!manual) {
          prices.set(asset.id, { priceArsCents: null, origin: 'none', updatedAt: null })
        } else if (asset.quote_currency === 'USD') {
          // Guardado en USD por unidad — se convierte con el dólar EN VIVO, no con el que estaba
          // vigente el día que se cargó. Así, cambiar la fuente del dólar en Ajustes mueve también
          // el valor de las acciones, no sólo el de USD como moneda suelta.
          prices.set(asset.id, {
            priceArsCents: usdRate.rateCents == null ? null : Math.round((manual.priceCents * usdRate.rateCents) / 100),
            origin: 'manual',
            updatedAt: manual.updatedAt,
          })
        } else {
          prices.set(asset.id, { priceArsCents: manual.priceCents, origin: 'manual', updatedAt: manual.updatedAt })
        }
      }
    }
    return prices
  }, [assets, manualPrices, usdRate.rateCents, usdRate.origin, usdRate.updatedAt, cryptoQuery.data])
}
