import { useQuery } from '@tanstack/react-query'
import { useProfile, type FxSource } from '@/features/profile/api'

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

export interface UsdRate {
  /** Centavos de ARS por 1 USD. `null` si no hay ninguna cotización disponible (ni API ni manual). */
  rateCents: number | null
  updatedAt: string | null
  origin: 'api' | 'manual' | 'none'
  /** La API falló (o la fuente elegida es manual) y se está mostrando el respaldo cargado a mano. */
  isFallback: boolean
}

/**
 * Cotización del dólar para valuar Patrimonio en ARS. Si `fx_source` del perfil es una casa de
 * dolarapi.com, la trae en vivo; si falla o la fuente es 'manual', cae al valor que el usuario cargó
 * en Ajustes. Nunca lanza — un dólar desactualizado es preferible a romper la pantalla de Patrimonio.
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
