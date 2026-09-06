import { cn } from '@/lib/cn'
import type { CategoryComparison } from '@/features/analytics/api'

/**
 * Barras CSS dobles (este período / anterior), no Recharts — mismo criterio que
 * `MonthlyEvolutionChart`. El ancho de cada barra es proporcional al mayor importe visible en la
 * lista, así que las seis se pueden comparar entre sí a simple vista.
 *
 * La leyenda del mockup dice "barra oscura / barra clara", pero cuál de las dos es la oscura se
 * invierte entre modo claro y oscuro (es literalmente `#16171d` vs. `#f1f0ec`) — acá la barra de
 * "este período" es `bg-fg`, que resuelve a uno u otro según el tema. Describirla por color sería
 * incorrecto la mitad del tiempo, así que la leyenda describe el rol (llena/tenue), no el color.
 */
export function TopCategoriesComparison({ data }: { data: CategoryComparison[] }) {
  const top = data.slice(0, 6)
  const maxCents = Math.max(...top.flatMap((c) => [c.currentCents, c.previousCents]), 1)

  return (
    <div className="flex flex-col gap-3.5">
      {top.map((c) => (
        <div key={c.categoryId}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
            <span className="truncate text-fg">{c.categoryName}</span>
            {c.changePct === null ? (
              <span className="tnum shrink-0 text-[11px] text-fg-muted">nuevo</span>
            ) : (
              <span className={cn('tnum shrink-0 font-semibold', c.changePct > 0 ? 'text-negative' : 'text-fg-muted')}>
                {c.changePct > 0 ? '+' : '−'}
                {Math.abs(Math.round(c.changePct))}%
              </span>
            )}
          </div>
          <span
            className="block h-[7px] rounded-pill bg-fg"
            style={{ width: `${(c.currentCents / maxCents) * 100}%` }}
          />
          <span
            className="mt-[3px] block h-[7px] rounded-pill bg-fill-subtle"
            style={{ width: `${(c.previousCents / maxCents) * 100}%` }}
          />
        </div>
      ))}
      <p className="mt-0.5 text-[11.5px] text-fg-muted">Barra llena: este período. Barra tenue: el anterior.</p>
    </div>
  )
}
