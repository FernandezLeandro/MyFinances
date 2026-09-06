import { cn } from '@/lib/cn'

type MiniProgressTone = 'negative' | 'accent' | 'muted'

const toneClasses: Record<MiniProgressTone, string> = {
  negative: 'bg-negative',
  accent: 'bg-accent',
  muted: 'bg-fg-secondary',
}

/** Barrita de progreso inline, 56×4px — el avance de una bolsa mensual dentro de su fila de lista.
 *  No confundir con `StackedBar` (proporción entre dos o más valores, más gruesa). */
export function MiniProgress({ pct, tone = 'muted', className }: { pct: number; tone?: MiniProgressTone; className?: string }) {
  return (
    <div className={cn('h-1 w-14 shrink-0 overflow-hidden rounded-full bg-fill-subtle', className)}>
      <div className={cn('h-full rounded-full', toneClasses[tone])} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}
