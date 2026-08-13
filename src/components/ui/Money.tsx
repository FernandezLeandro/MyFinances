import { cn } from '@/lib/cn'
import { splitMoney, type Currency } from '@/lib/money'

type Tone = 'acid' | 'coral' | 'chalk' | 'dim'
type Size = 'hero' | 'figure' | 'compact' | 'inline'

interface MoneyProps {
  cents: number
  tone?: Tone
  size?: Size
  /** Antepone "+" a los importes positivos. Para listas donde conviven ingresos y gastos. */
  signed?: boolean
  /** ARS por default — el resto de la app nunca la toca; Ahorros es lo único que usa USD. */
  currency?: Currency
  /** Enmascara la cifra (para el toggle de ocultar saldo) sin dejar de anunciar el símbolo. */
  hidden?: boolean
  className?: string
}

const tones: Record<Tone, string> = {
  acid: 'text-acid',
  coral: 'text-coral',
  chalk: 'text-chalk',
  dim: 'text-chalk-dim',
}

const sizes: Record<Size, { root: string; symbol: string; fraction: string }> = {
  hero: {
    root: 'font-display font-bold text-hero',
    symbol: 'text-[0.26em] mt-[0.28em] mr-[0.09em] text-chalk-faint',
    fraction: 'text-[0.34em] mt-[0.34em] ml-[0.06em]',
  },
  figure: {
    root: 'font-display font-semibold text-figure',
    symbol: 'text-[0.42em] mt-[0.36em] mr-[0.12em] text-chalk-faint',
    fraction: 'text-[0.5em] mt-[0.42em] ml-[0.08em]',
  },
  // Para el saldo de la nav: display, pero lo bastante chico como para no pelearle al hero.
  compact: {
    root: 'font-display font-semibold text-[20px]',
    symbol: 'text-[0.6em] mt-[0.32em] mr-[0.14em] text-chalk-faint',
    fraction: 'text-[0.6em] mt-[0.34em] ml-[0.06em]',
  },
  inline: {
    root: 'font-sans font-medium text-[15px]',
    symbol: 'mr-[0.25em] text-chalk-faint',
    fraction: 'text-[0.82em] mt-[0.15em] ml-[0.05em]',
  },
}

/**
 * Importe tipografiado: los centavos van más chicos y levantados, así la cifra se lee como un número
 * y no como un párrafo. Nunca formatear plata a mano en un componente — siempre pasar por acá.
 */
export function Money({
  cents,
  tone = 'chalk',
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
        {size === 'inline' ? `,${fraction}` : fraction}
      </span>
    </span>
  )
}
