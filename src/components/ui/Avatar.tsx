import { cn } from '@/lib/cn'

type AvatarTone = 'neutral' | 'accent'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md' | 'topbar'
  /** `circle` (default) para el sidebar/drawer de la nav vieja; `square` para el avatar de
   *  `TopBar` — el sistema nuevo lo dibuja con esquinas redondeadas, no un círculo. */
  shape?: 'circle' | 'square'
  /** `neutral` (default) para el admin — ahí no hay plata de nadie, así que el avatar es gris como
   *  el resto del shell. `accent` para la app financiera: el disparador del menú de cuenta se lee
   *  como el resto de la identidad, con el mismo azul que el saldo y el CTA. */
  tone?: AvatarTone
  className?: string
}

const sizeClasses = {
  sm: 'size-8 text-[12px] font-semibold',
  md: 'size-10 text-[13px] font-semibold',
  // El avatar de `TopBar`: 30px, iniciales más chicas y en 700 — el mock lo dibuja circular
  // siempre, sin importar `shape`.
  topbar: 'size-[30px] text-[11px] font-bold',
}

const shapeClasses = {
  circle: 'rounded-full',
  square: 'rounded-[10px]',
}

const toneClasses: Record<AvatarTone, string> = {
  neutral: 'bg-fill-subtle text-fg-secondary ring-1 ring-border-strong',
  accent: 'bg-accent-soft text-accent-text',
}

/**
 * Círculo (o cuadrado redondeado) de iniciales. En `neutral` (default) es deliberadamente gris, no
 * el acento — ese color se reserva para el dato principal y la serie primaria de un gráfico (ver
 * `theme.css`), y un avatar visible en cada pantalla lo rompería si viviera en cada shell. El
 * `TopBar` de la app financiera es la única excepción declarada: ahí el avatar SÍ es "plata que es
 * tuya" y usa `tone="accent"` (ver `AdminLayout`, que se queda en `neutral` a propósito).
 */
export function Avatar({ initials, size = 'sm', shape = 'circle', tone = 'neutral', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-display',
        sizeClasses[size],
        shapeClasses[shape],
        toneClasses[tone],
        className,
      )}
    >
      {initials}
    </span>
  )
}
