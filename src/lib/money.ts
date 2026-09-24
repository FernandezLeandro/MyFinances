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
 * Monedas soportadas en Ahorros. El resto de la app (movimientos, fijos, saldo) sigue
 * exclusivamente en ARS — esto no las vuelve multi-moneda, sólo le da a `Money` un segundo símbolo
 * para poder mostrar los aportes en USD sin tocar ningún call site existente.
 */
export type Currency = 'ARS' | 'USD'

const CURRENCY_SYMBOLS: Record<Currency, string> = { ARS: '$', USD: 'US$' }

/** Tope de un `numeric(12, 2)` en centavos — el mismo límite que ya validaban por separado
 *  `MAX_ABS_CENTS`/`MAX_ABS_CENTS_ADJUST` en `accounts/aggregate.ts`. FI-18 del QA de Fijos: acá no
 *  había ningún tope, así que 11 cifras tiraban un error genérico de la base en vez de uno claro en
 *  el campo. */
export const MAX_AMOUNT_CENTS = 1e12

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

/**
 * Deja sólo los caracteres que forman un importe mientras se escribe o se pega un valor. Coma y
 * punto se conservan porque la app acepta tanto el formato es-AR como el inglés al parsearlo.
 *
 * Los saldos de una cuenta pueden ser negativos; el resto de los importes no debería permitir el
 * signo desde el campo.
 */
export function sanitizeAmountInput(input: string, options: { allowNegative?: boolean } = {}): string {
  const numericCharacters = input.replace(/[^\d.,-]/g, '')
  if (!options.allowNegative) return numericCharacters.replace(/-/g, '')

  return numericCharacters.startsWith('-') ? `-${numericCharacters.slice(1).replace(/-/g, '')}` : numericCharacters.replace(/-/g, '')
}

/** Convierte lo que escribió el usuario ("1.234,50", "1234.5") a centavos. `null` si no es válido. */
export function parseAmountToCents(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // FI-18 del QA de Fijos: más de una coma ("1,2,3") no es "$1,23" — antes el resto del parseo lo
  // dejaba pasar como si sólo la primera fuera el separador decimal.
  if ((raw.match(/,/g) ?? []).length > 1) return null

  // es-AR usa "." de miles y "," de decimales; toleramos también el formato inglés.
  const hasComma = raw.includes(',')
  // MO-13 del QA de Movimientos: sin coma, "0.500" pasaba la heurística de separador de miles de
  // abajo (un punto seguido de exactamente 3 dígitos) y se guardaba como $500 en vez de $0,50 — nadie
  // escribe un grupo de miles que arranca en "0" (no existe "0.500.000"), así que un número que
  // empieza en "0." nunca tiene un separador de miles: el punto es decimal, y con 3+ dígitos después
  // el chequeo de más de 2 decimales de abajo lo rechaza en vez de adivinar mal.
  const startsWithZeroDot = /^-?0\./.test(raw)
  const normalized = hasComma
    ? raw.replace(/\./g, '').replace(',', '.')
    : startsWithZeroDot
      ? raw
      : raw.replace(/(?<=\d)\.(?=\d{3}\b)/g, '')

  const digitsOnly = normalized.replace(/[^\d.-]/g, '')
  // Sin esto, texto sin ningún dígito (p.ej. "abc") queda en "" tras el replace, y `Number('')`
  // es `0` — un importe "válido" que no lo es. Un input no numérico tiene que dar `null`, no `0`.
  if (!/\d/.test(digitsOnly)) return null

  // Si sigue quedando más de un punto acá, es un separador de miles que el regex de arriba no
  // reconoció (p.ej. "1.2.3") — no un número real.
  if ((digitsOnly.match(/\./g) ?? []).length > 1) return null

  // FI-18: más de 2 decimales ("0,005") redondeaba en silencio a un centavo que el usuario no
  // tipeó — mejor rechazarlo que adivinar.
  const decimalDigits = digitsOnly.split('.')[1]
  if (decimalDigits && decimalDigits.length > 2) return null

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

/** Sin símbolo, para prellenar un `AmountInput` editable: "12.480,50" (`parseAmountToCents` lo
 *  vuelve a leer tal cual). Dos call sites (form de fijos, popup de marcar pagado). */
export function centsToInputText(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
