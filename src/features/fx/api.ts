import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useProfile } from '@/features/profile/api'
import { useAssets } from '@/features/assets/api'
import { parseDollarQuotes, resolveQuotes, type ResolvedQuote } from './quotes'

const DOLLAR_QUOTES_STALE_MS = 30 * 60 * 1000

/** dolarapi.com no pide API key y confirmado con CORS abierto (`Access-Control-Allow-Origin: *`).
 *  Una sola llamada trae todas las casas. */
async function fetchDollarQuotes() {
  const res = await fetch('https://dolarapi.com/v1/dolares')
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`)
  return parseDollarQuotes(await res.json())
}

type CoinGeckoResponse = Record<string, { usd: number; last_updated_at: number }>

/** CoinGecko: sin key, confirmado con CORS abierto. Devuelve el precio en USD; a pesos se pasa con el
 *  dólar del activo, igual que el resto de los activos de mercado. */
async function fetchCoinGeckoPrices(ids: string[]): Promise<CoinGeckoResponse> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_last_updated_at=true`,
  )
  if (!res.ok) throw new Error(`coingecko respondió ${res.status}`)
  return res.json()
}

/**
 * Cotización de cada tipo de dólar. La API manda; si falla (o no trae un tipo) se usa el respaldo
 * manual que el usuario cargó en Ajustes. Nunca lanza — un dólar desactualizado es preferible a
 * romper la pantalla.
 */
export function useDollarQuotes() {
  const { data: profile } = useProfile()
  const query = useQuery({
    queryKey: ['dollar-quotes'],
    queryFn: fetchDollarQuotes,
    staleTime: DOLLAR_QUOTES_STALE_MS,
    retry: 1,
  })

  const manualCents = profile?.usdRateManualCents ?? null
  const manualAt = profile?.usdRateUpdatedAt ?? null

  const quotes = useMemo(
    () => resolveQuotes(query.data, manualCents == null ? null : { rateCents: manualCents, updatedAt: manualAt }),
    [query.data, manualCents, manualAt],
  )

  return { quotes, isPending: query.isPending && manualCents == null }
}

export interface UsdRate {
  /** Centavos de ARS por 1 USD. `null` si no hay ninguna cotización disponible (ni API ni manual). */
  rateCents: number | null
  updatedAt: string | null
  origin: 'api' | 'manual' | 'none'
  /** La API falló (o no trajo ese tipo) y se está mostrando el respaldo cargado a mano. */
  isFallback: boolean
}

/**
 * El «Dólar en uso» de Ajustes: el tipo que eligió el usuario (`fx_source`). Sólo convierte las cifras
 * que se MUESTRAN en dólares (el toggle ARS/USD de las pantallas), por eso usa la venta — lo que
 * cuesta ese dólar. Valuar una inversión no pasa por acá: cada una usa su propio tipo y la compra.
 */
export function useUsdRate() {
  const { data: profile } = useProfile()
  const { quotes, isPending } = useDollarQuotes()
  const source = profile?.fxSource ?? 'blue'
  const manualCents = profile?.usdRateManualCents ?? null
  const manualAt = profile?.usdRateUpdatedAt ?? null
  const quote: ResolvedQuote | undefined = source === 'manual' ? undefined : quotes.get(source)

  return useMemo(() => {
    const rate: UsdRate = (() => {
      if (quote?.origin === 'api') return { rateCents: quote.sellCents, updatedAt: quote.updatedAt, origin: 'api', isFallback: false }
      if (manualCents != null) return { rateCents: manualCents, updatedAt: manualAt, origin: 'manual', isFallback: source !== 'manual' }
      return { rateCents: null, updatedAt: null, origin: 'none', isFallback: source !== 'manual' }
    })()
    return { ...rate, isPending: source !== 'manual' && isPending }
  }, [quote, manualCents, manualAt, source, isPending])
}

export interface AssetPrice {
  /** USD por 1 unidad del activo. `null` si nadie la cargó todavía. */
  priceUsd: number | null
  origin: 'api' | 'admin' | 'none'
  updatedAt: string | null
}

/**
 * Precio en USD de cada activo de mercado del catálogo, por `asset_id`. Cripto (`price_source =
 * 'coingecko'`) pega una sola vez a CoinGecko por todos juntos; el resto lo fija el admin en
 * `assets.price_usd`, igual para todas las cuentas. ARS y USD no están: se valúan directo con el
 * dólar (ver `investments/aggregate.ts`). Nunca lanza — un precio faltante es `null`, no un error.
 */
export function useAssetPrices() {
  const { data: assets } = useAssets()

  const cryptoIds = [
    ...new Set((assets ?? []).filter((a) => a.price_source === 'coingecko' && a.coingecko_id).map((a) => a.coingecko_id!)),
  ].sort()

  const cryptoQuery = useQuery({
    queryKey: ['crypto-prices', cryptoIds.join(',')],
    queryFn: () => fetchCoinGeckoPrices(cryptoIds),
    enabled: cryptoIds.length > 0,
    staleTime: DOLLAR_QUOTES_STALE_MS,
    retry: 1,
  })

  // Memoizado: sin esto `prices` es un Map con identidad nueva en CADA render y rompe cualquier
  // `useMemo` que dependa de él más arriba (el agregado de inversiones).
  return useMemo(() => {
    const prices = new Map<string, AssetPrice>()
    for (const asset of assets ?? []) {
      if (asset.asset_class === 'fiat') continue
      if (asset.price_source === 'coingecko' && asset.coingecko_id) {
        const quote = cryptoQuery.data?.[asset.coingecko_id]
        prices.set(asset.id, {
          priceUsd: quote ? quote.usd : null,
          origin: quote ? 'api' : 'none',
          updatedAt: quote ? new Date(quote.last_updated_at * 1000).toISOString() : null,
        })
      } else {
        const priceUsd = asset.price_usd == null ? null : Number(asset.price_usd)
        prices.set(asset.id, {
          priceUsd,
          origin: priceUsd == null ? 'none' : 'admin',
          updatedAt: asset.price_updated_at,
        })
      }
    }
    return prices
  }, [assets, cryptoQuery.data])
}
