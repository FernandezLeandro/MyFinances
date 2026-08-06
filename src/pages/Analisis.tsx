import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSpendByCategory } from '@/features/transactions/api'
import { useMonthlySeries, useTopCategoriesComparison } from '@/features/analytics/api'
import { PeriodSelector } from '@/features/analytics/PeriodSelector'
import { defaultPeriod } from '@/features/analytics/period'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import { MonthlyEvolutionChart } from '@/features/analytics/MonthlyEvolutionChart'
import { BalanceTrendChart } from '@/features/analytics/BalanceTrendChart'
import { TopCategoriesComparison } from '@/features/analytics/TopCategoriesComparison'

export function Analisis() {
  const [period, setPeriod] = useState(defaultPeriod)
  const navigate = useNavigate()

  const { data: spend } = useSpendByCategory(period.from, period.to)
  const { data: series } = useMonthlySeries(period.from, period.to)
  const { data: comparison } = useTopCategoriesComparison(period.from, period.to)

  const total = (spend ?? []).reduce((acc, s) => acc + s.cents, 0)

  function goToCategory(categoryId: string) {
    navigate('/movimientos', { state: { categoryId } })
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Análisis</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Análisis</h1>
      </header>

      <PeriodSelector value={period} onChange={setPeriod} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <p className="eyebrow">En qué se fue la plata</p>

          {!spend || spend.length === 0 ? (
            <EmptyState glyph="◔" title="No hay gastos en este período" hint="Probá con un rango más amplio." />
          ) : (
            <div className="mt-4 grid gap-6 sm:grid-cols-2 sm:items-center">
              <CategoryDonut
                data={spend.map((s) => ({ categoryId: s.categoryId, categoryName: s.categoryName, color: s.color, cents: s.cents }))}
                onSelect={goToCategory}
              />

              <ul className="flex flex-col gap-4">
                {spend.map((s, i) => {
                  const share = total > 0 ? s.cents / total : 0
                  return (
                    <li key={s.categoryId}>
                      <button
                        type="button"
                        onClick={() => goToCategory(s.categoryId)}
                        className="flex w-full items-baseline justify-between gap-4 rounded-chip text-left transition-opacity hover:opacity-70"
                      >
                        <span className="flex items-center gap-2 text-[14px] text-chalk">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.categoryName}
                        </span>
                        <span className="flex items-baseline gap-3">
                          <span className="tnum text-[12px] text-chalk-faint">{(share * 100).toFixed(0)}%</span>
                          <Money cents={s.cents} tone={i === 0 ? 'chalk' : 'dim'} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="p-6">
          <p className="eyebrow">Top categorías vs. período anterior</p>
          {!comparison || comparison.length === 0 ? (
            <EmptyState glyph="◔" title="Todavía no hay datos" className="py-8" />
          ) : (
            <div className="mt-4">
              <TopCategoriesComparison data={comparison} />
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Evolución mensual" hint="Ingresos y gastos, mes a mes" />
        <div className="px-4 pb-5">
          {series && series.length > 0 ? (
            <MonthlyEvolutionChart data={series} />
          ) : (
            <EmptyState glyph="▤" title="Todavía no hay datos" className="py-8" />
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Tendencia de saldo" hint="Saldo acumulado al cierre de cada mes" />
        <div className="px-4 pb-5">
          {series && series.length > 0 ? (
            <BalanceTrendChart data={series} />
          ) : (
            <EmptyState glyph="◔" title="Todavía no hay datos" className="py-8" />
          )}
        </div>
      </Panel>
    </div>
  )
}
