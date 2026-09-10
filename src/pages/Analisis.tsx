import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MonthNav } from '@/components/ui/MonthNav'
import { cn } from '@/lib/cn'
import { useSpendByCategory, useTransactions } from '@/features/transactions/api'
import { movementPeriodFromRange } from '@/features/transactions/movementPeriod'
import { useCommittedPurchaseTransactionIds } from '@/features/credits/api'
import {
  useCategoryMonthlySeries,
  useMonthlySeries,
  usePreviousPeriodTotal,
  useTopCategoriesComparison,
} from '@/features/analytics/api'
import { summarizeCategoryMonthlyAverages, summarizeFijoVsVariable } from '@/features/analytics/aggregate'
import { PeriodSelector } from '@/features/analytics/PeriodSelector'
import { defaultPeriod, periodRangeLabel, shiftPeriodMonth } from '@/features/analytics/period'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import { TopCategoriesComparison } from '@/features/analytics/TopCategoriesComparison'

/** Una de las cifras chicas del hero (Ingresos / Neto / Por día). */
function HeroStat({ label, cents, tone, hint }: { label: string; cents: number; tone: MoneyTone; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} size="compact" tone={tone} signed={tone === 'accent'} className="mt-0.5" />
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{hint}</p>}
    </div>
  )
}

export function Analisis() {
  const [period, setPeriod] = useState(defaultPeriod)
  const navigate = useNavigate()

  const spendQuery = useSpendByCategory(period.from, period.to)
  const prevTotalQuery = usePreviousPeriodTotal(period.from, period.to)
  const comparisonQuery = useTopCategoriesComparison(period.from, period.to)
  const transactionsQuery = useTransactions({ from: period.from, to: period.to, type: 'expense' })
  const { data: committedPurchaseIds } = useCommittedPurchaseTransactionIds()
  const monthlySeriesQuery = useCategoryMonthlySeries(period.anchor)
  // Exacto cuando `period.from`/`to` están alineados a mes entero (todos los presets salvo
  // "Personalizado" — ver `presetToRange`): el RPC agrupa por mes calendario, así que un rango
  // "Personalizado" que arranca a mitad de mes va a incluir esos primeros días igual. Aceptado: es
  // el único caso, y el desvío es chico.
  const incomeSeriesQuery = useMonthlySeries(period.from, period.to)

  const { data: spend } = spendQuery
  const { data: comparison } = comparisonQuery
  const { data: transactions } = transactionsQuery
  const { data: monthlySeries } = monthlySeriesQuery

  const totalCents = (spend ?? []).reduce((acc, s) => acc + s.cents, 0)
  const incomeCents = (incomeSeriesQuery.data ?? []).reduce((acc, p) => acc + p.incomeCents, 0)
  const netCents = incomeCents - totalCents
  const prevTotalCents = prevTotalQuery.data ?? 0
  const changePct = prevTotalCents > 0 ? ((totalCents - prevTotalCents) / prevTotalCents) * 100 : null
  const days = Math.max(1, Math.round((parseISO(period.to).getTime() - parseISO(period.from).getTime()) / 86_400_000) + 1)

  const fijoVsVariable = useMemo(
    () => summarizeFijoVsVariable(transactions ?? [], committedPurchaseIds ?? new Set()),
    [transactions, committedPurchaseIds],
  )
  const promedioMensual = useMemo(() => summarizeCategoryMonthlyAverages(monthlySeries ?? []), [monthlySeries])

  const anchorMonthLabel = format(parseISO(period.anchor), 'MMMM', { locale: es })
  const prevMonthLabel = format(startOfMonth(parseISO(period.from)) < startOfMonth(parseISO(period.anchor)) ? parseISO(period.from) : parseISO(period.anchor), 'MMMM', { locale: es })
  // El hero dice "en {mes}" sólo cuando el preset ES un mes — en cualquier otro (3/6/12 meses,
  // personalizado) el gasto no corresponde a un solo mes, así que hablar de "agosto" sería
  // directamente incorrecto, no sólo impreciso.
  const heroPeriodLabel = period.preset === 'month' ? anchorMonthLabel : periodRangeLabel(period)
  const heroPrevPeriodLabel = period.preset === 'month' ? prevMonthLabel : 'el período anterior'

  function goToCategory(categoryId: string) {
    navigate('/movimientos', { state: { categoryId, period: movementPeriodFromRange(period.from, period.to) } })
  }

  const isPending = spendQuery.isPending || comparisonQuery.isPending
  const isError = spendQuery.isError

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <h1 className="font-display text-figure font-semibold">Análisis</h1>
          {period.preset === 'month' && (
            <MonthNav
              label={format(parseISO(period.anchor), 'MMMM yyyy', { locale: es })}
              mobileLabel={format(parseISO(period.anchor), 'MMMM', { locale: es })}
              onPrev={() => setPeriod((p) => shiftPeriodMonth(p, -1))}
              onNext={() => setPeriod((p) => shiftPeriodMonth(p, 1))}
            />
          )}
        </div>

        <div className="hidden lg:block">
          {period.preset === 'month' ? (
            <MonthNav
              label={format(parseISO(period.anchor), 'MMMM yyyy', { locale: es })}
              onPrev={() => setPeriod((p) => shiftPeriodMonth(p, -1))}
              onNext={() => setPeriod((p) => shiftPeriodMonth(p, 1))}
            />
          ) : (
            <p className="eyebrow">{periodRangeLabel(period)}</p>
          )}
          <h1 className="mt-2 font-display text-figure font-semibold">Análisis</h1>
        </div>

        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {isError ? (
        <Panel className="px-6 py-10">
          <ErrorState onRetry={() => spendQuery.refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-panel" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr]">
            <Skeleton className="h-64 w-full rounded-panel" />
            <Skeleton className="h-64 w-full rounded-panel" />
          </div>
        </div>
      ) : !spend || spend.length === 0 ? (
        <Panel>
          <EmptyState glyph="◔" title="No hay gastos en este período" hint="Probá con un rango más amplio." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-6 p-[18px] lg:flex-row lg:items-center lg:gap-9 lg:p-6">
            <div className="flex-none">
              <p className="eyebrow">Gastaste en {heroPeriodLabel}</p>
              <div className="mt-1 flex items-baseline gap-3">
                <Money cents={totalCents} size="hero" />
                {changePct != null && (
                  <Badge variant={changePct > 0 ? 'red' : 'soft'} className="tnum">
                    {changePct > 0 ? '+' : '−'}
                    {Math.abs(changePct).toFixed(1)}%
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-[12px] text-fg-muted">
                <Money cents={Math.abs(totalCents - prevTotalCents)} tone="dim" size="inline" />{' '}
                {totalCents <= prevTotalCents ? 'menos' : 'más'} que en {heroPrevPeriodLabel} (
                <Money cents={prevTotalCents} tone="dim" size="inline" />)
              </p>
            </div>

            <div className="flex flex-1 flex-wrap justify-between gap-x-6 gap-y-3 lg:justify-end lg:gap-x-9">
              <HeroStat label="Ingresos" cents={incomeCents} tone="fg" />
              <HeroStat label="Neto" cents={netCents} tone={netCents >= 0 ? 'accent' : 'negative'} />
              <HeroStat label="Por día" cents={Math.round(totalCents / days)} tone="fg" hint={`sobre ${days} días`} />
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr] lg:items-stretch">
            <Panel className="p-6">
              <p className="eyebrow">En qué se fue la plata</p>
              <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row lg:gap-8">
                <CategoryDonut
                  data={spend.map((s) => ({ categoryId: s.categoryId, categoryName: s.categoryName, color: s.color, cents: s.cents }))}
                  onSelect={goToCategory}
                  centerLabel="gasto"
                  size={196}
                />
                <ul className="flex w-full min-w-0 flex-col gap-1">
                  {spend.map((s, i) => {
                    const share = totalCents > 0 ? s.cents / totalCents : 0
                    return (
                      <li key={s.categoryId}>
                        <button
                          type="button"
                          onClick={() => goToCategory(s.categoryId)}
                          className="flex w-full items-center gap-3 rounded-chip py-2 text-left transition-opacity hover:opacity-70"
                        >
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{s.categoryName}</span>
                          <span className="hidden h-[5px] w-24 shrink-0 overflow-hidden rounded-pill bg-fill-subtle sm:block">
                            <span className="block h-full rounded-pill" style={{ width: `${share * 100}%`, backgroundColor: s.color }} />
                          </span>
                          <span className="tnum w-9 shrink-0 text-right text-[12px] text-fg-muted">{Math.round(share * 100)}%</span>
                          <Money cents={s.cents} tone={i === 0 ? 'fg' : 'dim'} size="row" className="w-24 shrink-0 justify-end" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </Panel>

            <Panel className="flex flex-col p-6">
              <p className="eyebrow">Fijo vs. variable</p>
              <div className="mt-4 flex h-3 overflow-hidden rounded-control bg-fill-subtle">
                <div className="h-full bg-inverse" style={{ width: `${fijoVsVariable.committedPct}%` }} />
                <div className="h-full bg-accent" style={{ width: `${fijoVsVariable.variablePct}%` }} />
              </div>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-fg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg-secondary">Ya estaba comprometido</p>
                    <Money cents={fijoVsVariable.committedCents} size="figure" className="mt-0.5" />
                    <p className="mt-0.5 text-[11.5px] text-fg-muted">{fijoVsVariable.committedPct}% del gasto · fijos y cuotas</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-fg-secondary">Decidiste vos</p>
                    <Money cents={fijoVsVariable.variableCents} tone="accent" size="figure" className="mt-0.5" />
                    <p className="mt-0.5 text-[11.5px] text-fg-muted">
                      {fijoVsVariable.variablePct}% del gasto · <Money cents={Math.round(fijoVsVariable.variableCents / days)} tone="dim" size="inline" /> por
                      día
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-auto pt-4 text-[11.5px] leading-relaxed text-fg-muted">
                De cada $100 que gastaste, ${fijoVsVariable.committedPct} ya estaban decididos antes de que arrancara el período.
              </p>
            </Panel>
          </div>

          <div className="hidden gap-4 lg:grid lg:grid-cols-2 lg:items-start">
            <Panel className="p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">Top categorías vs. período anterior</p>
              </div>
              {comparisonQuery.isError ? (
                <ErrorState onRetry={() => comparisonQuery.refetch()} className="mt-4" />
              ) : !comparison || comparison.length === 0 ? (
                <EmptyState glyph="◔" title="Todavía no hay datos" className="py-8" />
              ) : (
                <div className="mt-4">
                  <TopCategoriesComparison data={comparison} />
                </div>
              )}
            </Panel>

            <Panel className="p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">Promedio mensual por categoría</p>
                <span className="text-[11.5px] text-fg-muted">últimos 12 meses</span>
              </div>
              {monthlySeriesQuery.isError ? (
                <ErrorState onRetry={() => monthlySeriesQuery.refetch()} className="mt-4" />
              ) : monthlySeriesQuery.isPending ? (
                <div className="mt-4 flex flex-col gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : promedioMensual.length === 0 ? (
                <EmptyState glyph="▤" title="Todavía no hay datos" className="py-8" />
              ) : (
                <div className="mt-3.5">
                  <div className="flex items-center gap-3 border-b border-divider pb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">
                    <span className="min-w-0 flex-1">Categoría</span>
                    <span className="w-20 shrink-0 text-right">Promedio</span>
                    <span className="w-20 shrink-0 text-right">{anchorMonthLabel}</span>
                    <span className="w-12 shrink-0 text-right">Desvío</span>
                  </div>
                  {promedioMensual.map((p) => (
                    <div key={p.categoryId} className="flex items-center gap-3 border-b border-divider py-2.5 last:border-b-0">
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="truncate text-[13px] text-fg">{p.categoryName}</span>
                      </span>
                      <Money cents={p.avgCents} tone="dim" size="row" className="w-20 shrink-0 justify-end" />
                      <Money cents={p.nowCents} size="row" className="w-20 shrink-0 justify-end" />
                      <span
                        className={cn(
                          'tnum w-12 shrink-0 text-right text-[12px] font-semibold',
                          p.deviationPct == null ? 'text-fg-muted' : p.deviationPct > 0 ? 'text-negative' : 'text-accent',
                        )}
                      >
                        {p.deviationPct == null ? '—' : `${p.deviationPct > 0 ? '+' : ''}${p.deviationPct}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
