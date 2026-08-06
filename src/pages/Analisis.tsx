import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSpendByCategory } from '@/features/transactions/api'

export function Analisis() {
  const from = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const to = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const { data: spend } = useSpendByCategory(from, to)

  const total = (spend ?? []).reduce((acc, s) => acc + s.cents, 0)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">{format(new Date(), 'MMMM yyyy', { locale: es })}</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Análisis</h1>
      </header>

      <Panel className="p-6">
        <p className="eyebrow">En qué se fue la plata</p>

        {!spend || spend.length === 0 ? (
          <EmptyState
            glyph="◔"
            title="Todavía no hay gastos este mes"
            hint="Los gráficos de tendencia y la comparación con el mes anterior llegan en el Bloque 4."
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {spend.map((s, i) => {
              const share = total > 0 ? s.cents / total : 0
              return (
                <li key={s.categoryId}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-chalk">{s.categoryName}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="tnum text-[12px] text-chalk-faint">{(share * 100).toFixed(0)}%</span>
                      <Money cents={s.cents} tone={i === 0 ? 'chalk' : 'dim'} />
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-850">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${share * 100}%`, backgroundColor: i === 0 ? 'var(--color-acid)' : s.color }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
