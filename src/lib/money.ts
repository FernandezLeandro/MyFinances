/**
 * Manejo de importes.
 *
 * Regla del proyecto: la plata se guarda y se opera en **centavos enteros**. En cuanto un importe
 * pasa por un `number` con decimales, 0.1 + 0.2 deja de dar 0.3 y los saldos empiezan a no cerrar.
 * Sólo se convierte a decimal en el borde: al mostrar o al leer el input del usuario.
 */

export const CURRENCY = 'ARS'
const LOCALE = 'es-AR'

/** Convierte lo que escribió el usuario ("1.234,50", "1234.5") a centavos. `null` si no es válido. */
export function parseAmountToCents(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // es-AR usa "." de miles y "," de decimales; toleramos también el formato inglés.
  const hasComma = raw.includes(',')
  const normalized = hasComma ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/(?<=\d)\.(?=\d{3}\b)/g, '')

  const value = Number(normalized.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(value)) return null

  return Math.round(value * 100)
}

/** Importe completo con símbolo: "$ 12.480,50" */
export function formatMoney(cents: number, options: { signed?: boolean } = {}): string {
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)

  return options.signed && cents > 0 ? `+${formatted}` : formatted
}

/** Sin símbolo ni decimales, para ejes de gráficos: "12.480" */
export function formatCompact(cents: number): string {
  const value = Math.abs(cents) / 100
  const sign = cents < 0 ? '-' : ''
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (value >= 1_000) return `${sign}${Math.round(value / 1_000)}k`
  return `${sign}${Math.round(value)}`
}

/**
 * Parte el importe para poder tipografiarlo distinto: los centavos van más chicos que los enteros.
 * Es lo que hace que la cifra hero se lea como un número y no como un párrafo.
 */
export function splitMoney(cents: number): { sign: string; symbol: string; whole: string; fraction: string } {
  const negative = cents < 0
  const parts = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(Math.abs(cents) / 100)

  const whole = parts
    .filter((p) => p.type === 'integer' || p.type === 'group')
    .map((p) => p.value)
    .join('')
  const fraction = parts.find((p) => p.type === 'fraction')?.value ?? '00'

  return { sign: negative ? '−' : '', symbol: '$', whole, fraction }
}
