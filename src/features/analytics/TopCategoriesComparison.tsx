import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import type { CategoryComparison } from '@/features/analytics/api'

export function TopCategoriesComparison({ data }: { data: CategoryComparison[] }) {
  const top = data.slice(0, 6)

  return (
    <ul className="flex flex-col gap-4">
      {top.map((c) => (
        <li key={c.categoryId} className="flex items-center gap-3">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
          <span className="min-w-0 flex-1 truncate text-[14px] text-chalk">{c.categoryName}</span>
          {c.changePct === null ? (
            <span className="text-[11px] text-chalk-faint">nuevo</span>
          ) : (
            <span
              className={cn(
                'tnum flex items-center gap-0.5 text-[11px]',
                c.changePct > 0 ? 'text-coral' : 'text-chalk-faint',
              )}
            >
              {c.changePct > 0 ? '▲' : '▼'} {Math.abs(Math.round(c.changePct))}%
            </span>
          )}
          <Money cents={c.currentCents} tone="dim" />
        </li>
      ))}
    </ul>
  )
}
