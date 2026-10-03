import { Badge } from '@/components/ui/Badge'
import { Money } from '@/components/ui/Money'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import type { CategoryComparison } from '@/features/analytics/api'

/**
 * Una barra por categoría (no dos, a diferencia de la versión anterior): coloreada como el donut,
 * con una marca vertical en la posición del período anterior — así se ve de un vistazo si la barra
 * "avanzó" o "retrocedió" contra esa marca, en vez de comparar dos barras separadas.
 *
 * `iconById` no sale de `CategoryComparison` (la RPC no trae ícono) — lo arma `Analisis` con
 * `useCategories`, igual que para `CategoryLegendRow` y `PromedioRow`.
 */
export function TopCategoriesComparison({ data, iconById }: { data: CategoryComparison[]; iconById: Map<string, string | null | undefined> }) {
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
                <CategoryChip size={20} {...chipLook(c.color != null ? { color: c.color, icon: iconById.get(c.categoryId) } : undefined)} />
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
              <div className="h-full rounded-pill transition-[width] duration-500 ease-out-quint" style={{ width: `${pct}%`, backgroundColor: c.color ?? 'var(--color-border-strong)' }} />
              {/* AN-11 del QA de Análisis: con `prevPct` exactamente en 100% (el período anterior es
                  el máximo absoluto), `left: 100%` deja la marca de 2px entera fuera del contenedor
                  — con `overflow-hidden` de arriba, 0px visibles. `calc` la retrocede lo justo para
                  que quede pegada al borde derecho en vez de desaparecer. */}
              <div className="absolute inset-y-0 w-[2px] bg-fg-muted transition-[left] duration-500 ease-out-quint" style={{ left: `min(${prevPct}%, calc(100% - 2px))` }} />
            </div>
          </li>
        )
      })}
      <p className="mt-0.5 text-[11.5px] text-fg-muted">La marca vertical señala el período anterior.</p>
    </ul>
  )
}
