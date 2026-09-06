import { cn } from '@/lib/cn'
import { splitMoney, type Currency } from '@/lib/money'

export type MoneyTone =
  | 'accent'
  | 'negative'
  | 'fg'
  | 'dim'
  // Texto sobre una tarjeta invertida (fondo oscuro fijo, ver `Panel` tone="inverse") — siempre claro,
  // a diferencia de `fg`/`dim` que resuelven distinto según el tema de la app.
  | 'onInverse'
  | 'onInverseSecondary'
  | 'negativeOnInverse'
type Size = 'hero' | 'figure' | 'total' | 'compact' | 'inline' | 'row'

interface MoneyProps {
  cents: number
  tone?: MoneyTone
  size?: Size
  /** Antepone "+" a los importes positivos. Para listas donde conviven ingresos y gastos. */
  signed?: boolean
  /** ARS por default — el resto de la app nunca la toca; Ahorros es lo único que usa USD. */
  currency?: Currency
  /** Enmascara la cifra (para el toggle de ocultar saldo) sin dejar de anunciar el símbolo. */
  hidden?: boolean
  className?: string
}

const tones: Record<MoneyTone, string> = {
  accent: 'text-accent',
  negative: 'text-negative',
  fg: 'text-fg',
  dim: 'text-fg-secondary',
  onInverse: 'text-on-inverse',
  onInverseSecondary: 'text-on-inverse-secondary',
  negativeOnInverse: 'text-negative-on-inverse',
}

const sizes: Record<Size, { root: string; symbol: string; fraction: string }> = {
  hero: {
    root: 'font-display font-bold text-hero',
    symbol: 'text-[0.26em] mt-[0.28em] mr-[0.09em] text-fg-muted',
    fraction: 'text-[0.34em] mt-[0.34em] ml-[0.06em]',
  },
  figure: {
    root: 'font-display font-semibold text-figure',
    symbol: 'text-[0.42em] mt-[0.36em] mr-[0.12em] text-fg-muted',
    fraction: 'text-[0.5em] mt-[0.42em] ml-[0.08em]',
  },
  // Entre `hero` y `figure` — el total de una tarjeta secundaria (Ahorros), lo bastante grande para
  // ser la cifra principal de su tarjeta, pero sin competir con el saldo hero de Hoy.
  total: {
    root: 'font-display font-bold text-[46px] leading-none tracking-[-0.04em]',
    symbol: 'text-[0.4em] mt-[0.32em] mr-[0.12em] text-fg-muted',
    fraction: 'text-[0.44em] mt-[0.36em] ml-[0.05em]',
  },
  // Para el saldo de la nav: display, pero lo bastante chico como para no pelearle al hero.
  compact: {
    root: 'font-display font-semibold text-[20px]',
    symbol: 'text-[0.6em] mt-[0.32em] mr-[0.14em] text-fg-muted',
    fraction: 'text-[0.6em] mt-[0.34em] ml-[0.06em]',
  },
  inline: {
    root: 'font-sans font-medium text-[15px]',
    symbol: 'mr-[0.25em] text-fg-muted',
    fraction: 'text-[0.82em] mt-[0.15em] ml-[0.05em]',
  },
  // Importe de una fila de lista (`TransactionRow` y afines) — más chico y semibold que `inline`,
  // no sólo `inline` con otro tamaño: el peso también cambia (600, no 500).
  row: {
    root: 'font-sans font-semibold text-[14px]',
    symbol: 'mr-[0.2em] text-fg-muted',
    fraction: 'text-[0.82em] mt-[0.12em] ml-[0.05em]',
  },
}

/**
 * Importe tipografiado: los centavos van más chicos y levantados, así la cifra se lee como un número
 * y no como un párrafo. Nunca formatear plata a mano en un componente — siempre pasar por acá.
 */
export function Money({
  cents,
  tone = 'fg',
  size = 'inline',
  signed = false,
  currency = 'ARS',
  hidden = false,
  className,
}: MoneyProps) {
  const { sign, symbol, whole, fraction } = splitMoney(cents, currency)
  const s = sizes[size]
  const prefix = sign || (signed && cents > 0 ? '+' : '')

  if (hidden) {
    return (
      <span
        className={cn('tnum inline-flex items-start leading-none', s.root, tones[tone], className)}
        aria-label="Saldo oculto"
      >
        <span className={s.symbol} aria-hidden>
          {symbol}
        </span>
        <span aria-hidden>••••</span>
      </span>
    )
  }

  return (
    <span
      className={cn('tnum inline-flex items-start leading-none', s.root, tones[tone], className)}
      // El lector de pantalla no debe deletrear los fragmentos por separado.
      aria-label={`${prefix}${symbol}${whole},${fraction}`}
    >
      {prefix && <span aria-hidden>{prefix}</span>}
      <span className={s.symbol} aria-hidden>
        {symbol}
      </span>
      <span aria-hidden>{whole}</span>
      <span className={s.fraction} aria-hidden>
        ,{fraction}
      </span>
    </span>
  )
}
