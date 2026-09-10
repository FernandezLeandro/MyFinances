import { Badge } from '@/components/ui/Badge'
import { Money } from '@/components/ui/Money'
import type { CategoryComparison } from '@/features/analytics/api'

/**
 * Una barra por categoría (no dos, a diferencia de la versión anterior): coloreada como el donut,
 * con una marca vertical en la posición del período anterior — así se ve de un vistazo si la barra
 * "avanzó" o "retrocedió" contra esa marca, en vez de comparar dos barras separadas.
 */
export function TopCategoriesComparison({ data }: { data: CategoryComparison[] }) {
  const top = data.slice(0, 6)
  const maxCents = Math.max(...top.flatMap((c) => [c.currentCents, c.previousCents]), 1)

  return (
    <ul className="flex flex-col gap-4">
      {top.map((c) => {
        const pct = Math.min((c.currentCents / maxCents) * 100, 100)
        const prevPct = Math.min((c.previousCents / maxCents) * 100, 100)
        const variant = c.changePct == null ? 'neutral' : c.changePct > 0 ? 'red' : c.changePct === 0 ? 'neutral' : 'soft'

        return (
          <li key={c.categoryId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="truncate text-[13px] text-fg">{c.categoryName}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <Badge variant={variant} className="tnum">
                  {c.changePct == null ? 'nuevo' : `${c.changePct > 0 ? '+' : c.changePct < 0 ? '−' : ''}${Math.abs(Math.round(c.changePct))}%`}
                </Badge>
                <Money cents={c.currentCents} size="row" />
              </span>
            </div>
            <div className="relative mt-1.5 h-2 overflow-hidden rounded-pill bg-fill-subtle">
              <div className="h-full rounded-pill" style={{ width: `${pct}%`, backgroundColor: c.color }} />
              <div className="absolute inset-y-0 w-[2px] bg-fg-muted" style={{ left: `${prevPct}%` }} />
            </div>
          </li>
        )
      })}
      <p className="mt-0.5 text-[11.5px] text-fg-muted">La marca vertical señala el período anterior.</p>
    </ul>
  )
}
