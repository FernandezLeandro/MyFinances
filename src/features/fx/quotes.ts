/**
 * Cotizaciones del dólar — lógica pura, separada de la red (`fx/api.ts`) para poder probarla sin
 * levantar nada. dolarapi.com trae todas las casas en una sola llamada (`/v1/dolares`); cada una con
 * `compra` (lo que te pagan si vendés) y `venta` (lo que pagás si comprás).
 */
export type DollarType = 'oficial' | 'blue' | 'bolsa' | 'contadoconliqui' | 'cripto'

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

const DOLLAR_TYPE_SET: ReadonlySet<string> = new Set(DOLLAR_TYPES.map((d) => d.value))

function toCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null
}

/**
 * Lo que devuelve `https://dolarapi.com/v1/dolares` → un mapa por tipo. Ignora las casas que la app no
 * usa (mayorista, tarjeta) y las filas mal formadas: un tipo que falta no rompe a los demás.
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
