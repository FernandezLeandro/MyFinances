import { Panel } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { categoryById, mockTransactions, monthExpense } from '@/lib/mock'

export function Analisis() {
  // Bloque 0: el reparto se calcula sobre el mock. En el Bloque 4 lo resuelve `v_spend_by_category`.
  const porCategoria = [...new Map<string, number>(
    mockTransactions
      .filter((t) => t.type === 'expense')
      .reduce((map, t) => map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.cents), new Map<string, number>()),
  )].sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Agosto 2026</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Análisis</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <p className="eyebrow">En qué se fue la plata</p>
          <ul className="mt-6 flex flex-col gap-4">
            {porCategoria.map(([id, cents], i) => {
              const category = categoryById.get(id)
              const share = cents / monthExpense
              return (
                <li key={id}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-chalk">{category?.name}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="tnum text-[12px] text-chalk-faint">
                        {(share * 100).toFixed(0)}%
                      </span>
                      <Money cents={cents} tone={i === 0 ? 'chalk' : 'dim'} />
                    </span>
                  </div>
                  {/* Barra horizontal: comparar longitudes es más fácil que comparar ángulos. */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-850">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${share * 100}%`,
                        // El ácido queda para la serie primaria; el resto usa el color de su categoría.
                        backgroundColor: i === 0 ? 'var(--color-acid)' : category?.color,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel tone="flat">
          <EmptyState
            glyph="◔"
            title="Evolución mensual"
            hint="Los gráficos de tendencia y la comparación con el mes anterior llegan en el Bloque 4."
          />
        </Panel>
      </div>
    </div>
  )
}
