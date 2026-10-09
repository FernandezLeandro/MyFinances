/**
 * Cotizaciones del dólar — lógica pura, separada de la red (`fx/api.ts`) para poder probarla sin
 * levantar nada. dolarapi.com trae todas las casas en una sola llamada (`/v1/dolares`); cada una con
 * `compra` (lo que te pagan si vendés) y `venta` (lo que pagás si comprás).
 */
import type { FxSource } from '@/features/profile/api'

export type DollarType = Exclude<FxSource, 'manual'>

/** Orden y nombres con los que se muestran los tipos de dólar en toda la app. */
export const DOLLAR_TYPES: readonly { value: DollarType; label: string }[] = [
  { value: 'oficial', label: 'Oficial' },
  { value: 'blue', label: 'Blue' },
  { value: 'bolsa', label: 'MEP' },
  { value: 'contadoconliqui', label: 'CCL' },
  { value: 'cripto', label: 'Cripto' },
]

export function dollarLabel(type: DollarType): string {
  return DOLLAR_TYPES.find((d) => d.value === type)?.label ?? type
}

export interface DollarQuote {
  /** Centavos de ARS por 1 USD que te pagan si vendés. */
  buyCents: number
  /** Centavos de ARS por 1 USD que pagás si comprás. */
  sellCents: number
  updatedAt: string | null
}

/** `origin: 'manual'` = la API no trajo ese tipo (o falló) y se usa el valor de respaldo del perfil. */
export interface ResolvedQuote extends DollarQuote {
  origin: 'api' | 'manual'
}

const DOLLAR_TYPE_SET: ReadonlySet<string> = new Set(DOLLAR_TYPES.map((d) => d.value))

function toCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
}

/**
 * Lo que devuelve `https://dolarapi.com/v1/dolares` → un mapa por tipo. Ignora las casas que la app no
 * usa (mayorista, tarjeta) y las filas mal formadas: un tipo que falta se resuelve con el respaldo
 * manual en `resolveQuotes`, no rompe a los demás.
 */
export function parseDollarQuotes(rows: unknown): Map<DollarType, DollarQuote> {
  const quotes = new Map<DollarType, DollarQuote>()
  if (!Array.isArray(rows)) return quotes

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { casa, compra, venta, fechaActualizacion } = row as Record<string, unknown>
    if (typeof casa !== 'string' || !DOLLAR_TYPE_SET.has(casa)) continue
    const buyCents = toCents(compra)
    const sellCents = toCents(venta)
    if (buyCents == null || sellCents == null) continue
    quotes.set(casa as DollarType, {
      buyCents,
      sellCents,
      updatedAt: typeof fechaActualizacion === 'string' ? fechaActualizacion : null,
    })
  }
  return quotes
}

/**
 * Un valor por cada tipo de dólar: el de la API si lo trajo, y si no el respaldo manual del perfil
 * (compra = venta, es un solo número). Sin ninguno de los dos el tipo no está en el mapa.
 */
export function resolveQuotes(
  api: ReadonlyMap<DollarType, DollarQuote> | undefined,
  manual: { rateCents: number; updatedAt: string | null } | null,
): Map<DollarType, ResolvedQuote> {
  const resolved = new Map<DollarType, ResolvedQuote>()
  for (const { value } of DOLLAR_TYPES) {
    const fromApi = api?.get(value)
    if (fromApi) resolved.set(value, { ...fromApi, origin: 'api' })
    else if (manual) {
      resolved.set(value, { buyCents: manual.rateCents, sellCents: manual.rateCents, updatedAt: manual.updatedAt, origin: 'manual' })
    }
  }
  return resolved
}
