import { cn } from '@/lib/cn'

type MiniProgressTone = 'negative' | 'accent' | 'muted' | 'amber' | 'onInverse'
/** `inline` = la barrita de 56×4 de una fila de lista. `bar` = la barra ancha de un hero (el avance
 *  de pago de Fijos, el guardado de Mis Deudas, la meta de un ítem de Ahorros). No se resuelve con
 *  `className` porque `cn` no dedupe: `h-1` y `h-1.5` juntos ganan por orden de Tailwind, no por
 *  orden de escritura. */
type MiniProgressSize = 'inline' | 'bar'

const toneClasses: Record<MiniProgressTone, string> = {
  negative: 'bg-negative',
  accent: 'bg-accent',
  muted: 'bg-fg-secondary',
  amber: 'bg-badge-amber-fg',
  onInverse: 'bg-on-inverse',
}

const trackClasses: Record<MiniProgressSize, string> = {
  inline: 'h-1 w-14 shrink-0',
  bar: 'h-1.5 w-full',
}

/** Barra de progreso. `inline` para una fila de lista, `bar` para el avance de un hero.
 *  No confundir con `StackedBar` (proporción entre dos o más valores que suman el total). */
export function MiniProgress({
  pct,
  tone = 'muted',
  size = 'inline',
  className,
}: {
  pct: number
  tone?: MiniProgressTone
  size?: MiniProgressSize
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-full',
        trackClasses[size],
        // Sobre una tarjeta invertida el track gris no se ve: tiene que ser el propio texto claro
        // con opacidad, igual que resuelve `StackedBar` en la tarjeta de proyectado.
        tone === 'onInverse' ? 'bg-on-inverse/20' : 'bg-fill-subtle',
        className,
      )}
    >
      <div className={cn('h-full rounded-full', toneClasses[tone])} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}
