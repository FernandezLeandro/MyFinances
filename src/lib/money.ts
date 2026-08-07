/**
 * Manejo de importes.
 *
 * Regla del proyecto: la plata se guarda y se opera en **centavos enteros**. En cuanto un importe
 * pasa por un `number` con decimales, 0.1 + 0.2 deja de dar 0.3 y los saldos empiezan a no cerrar.
 * Sólo se convierte a decimal en el borde: al mostrar o al leer el input del usuario.
 */

export const CURRENCY = 'ARS'
const LOCALE = 'es-AR'

/**
 * Monedas soportadas en Patrimonio. El resto de la app (movimientos, fijos, saldo) sigue
 * exclusivamente en ARS — esto no las vuelve multi-moneda, sólo le da a `Money` un segundo símbolo
 * para poder mostrar los aportes en USD sin tocar ningún call site existente.
 */
export type Currency = 'ARS' | 'USD'

const CURRENCY_SYMBOLS: Record<Currency, string> = { ARS: '$', USD: 'US$' }

/**
 * Convierte un `numeric` tal como lo devuelve PostgREST (string con punto decimal, p.ej. "1234.50")
 * a centavos enteros. Distinto de `parseAmountToCents`: ese interpreta lo que tipea el usuario
 * (con comas y formato es-AR), esto interpreta lo que ya devolvió la base.
 */
export function centsFromNumeric(value: string): number {
  return Math.round(Number(value) * 100)
}

/** Centavos enteros → string decimal para mandar a un `numeric(12,2)` de la base. */
export function centsToNumeric(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Convierte lo que escribió el usuario ("1.234,50", "1234.5") a centavos. `null` si no es válido. */
export function parseAmountToCents(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // es-AR usa "." de miles y "," de decimales; toleramos también el formato inglés.
  const hasComma = raw.includes(',')
  const normalized = hasComma ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/(?<=\d)\.(?=\d{3}\b)/g, '')

  const digitsOnly = normalized.replace(/[^\d.-]/g, '')
  // Sin esto, texto sin ningún dígito (p.ej. "abc") queda en "" tras el replace, y `Number('')`
  // es `0` — un importe "válido" que no lo es. Un input no numérico tiene que dar `null`, no `0`.
  if (!/\d/.test(digitsOnly)) return null

  const value = Number(digitsOnly)
  if (!Number.isFinite(value)) return null

  return Math.round(value * 100)
}

/** Importe completo con símbolo: "$ 12.480,50" */
export function formatMoney(cents: number, options: { signed?: boolean; currency?: Currency } = {}): string {
  const formatted = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: options.currency ?? CURRENCY,
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
export function splitMoney(
  cents: number,
  currency: Currency = 'ARS',
): { sign: string; symbol: string; whole: string; fraction: string } {
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

  return { sign: negative ? '−' : '', symbol: CURRENCY_SYMBOLS[currency], whole, fraction }
}

/**
 * Versiones genéricas de `centsFromNumeric`/`centsToNumeric`/`parseAmountToCents` para cantidades de
 * un activo con una escala propia (2 decimales para dinero/acciones, 8 para cripto — estilo
 * satoshi). Con `decimals = 2` se comportan exactamente igual que las funciones de ARS-cents de
 * arriba, que quedan intactas: todo lo que ya usa `centsFromNumeric` sigue andando sin tocarlo.
 */
export function unitsFromNumeric(value: string, decimals: number): number {
  return Math.round(Number(value) * 10 ** decimals)
}

export function unitsToNumeric(units: number, decimals: number): string {
  return (units / 10 ** decimals).toFixed(decimals)
}

/** Cantidad de un activo sin arrastrar ceros de más: "0,015" en vez de "0,01500000". */
export function formatQuantity(units: number, decimals: number): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(
    units / 10 ** decimals,
  )
}

/** Convierte lo que escribió el usuario a unidades enteras en la escala de `decimals`. `null` si no es válido. */
export function parseQuantity(input: string, decimals: number): number | null {
  const raw = input.trim()
  if (!raw) return null

  const hasComma = raw.includes(',')
  const normalized = hasComma ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/(?<=\d)\.(?=\d{3}\b)/g, '')

  const digitsOnly = normalized.replace(/[^\d.-]/g, '')
  // Mismo bug que en parseAmountToCents: sin esto, texto sin dígitos daba `0`, no `null`.
  if (!/\d/.test(digitsOnly)) return null

  const value = Number(digitsOnly)
  if (!Number.isFinite(value)) return null

  return Math.round(value * 10 ** decimals)
}
