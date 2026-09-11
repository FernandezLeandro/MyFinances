import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CycleNav } from '@/components/ui/CycleNav'
import { cn } from '@/lib/cn'
import { useChartColors } from '@/lib/chartColors'
import { splitTopN } from '@/lib/topN'
import { cycleContaining, cycleLabel } from '@/lib/cycle'
import { useCycleConfig } from '@/lib/useCycle'
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
import { comparisonRange, defaultPeriod, periodRangeLabel, presetToRange, shiftPeriodMonth } from '@/features/analytics/period'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import { TopCategoriesComparison } from '@/features/analytics/TopCategoriesComparison'

/** Sentinel para la porción "Otros" del donut — nunca choca con un id real (son uuid). */
const OTROS_ID = '__otros__'
const TOP_CATEGORIES_N = 6

/** Una de las cifras chicas del hero (Ingresos / Neto / Por día). `figure` (no `compact`) para que
 *  no se sientan chicas al lado del hero — mismo tamaño que usan los rail de Fijos/Fijo-vs-variable
 *  para su cifra principal, escala solo con el viewport (clamp en `theme.css`). En mobile las tres
 *  comparten fila en una grilla de 3 columnas angostas (~120px c/u): el piso del clamp de `figure`
 *  (25px) es más ancho que eso y las cifras se pisaban entre sí — `max-lg:!text-[16px]` las achica
 *  sólo por debajo de `lg`, donde SÍ tienen su propia fila ancha para el tamaño completo. */
function HeroStat({
  label,
  cents,
  tone,
  hint,
  className,
}: {
  label: string
  cents: number
  tone: MoneyTone
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} size="figure" tone={tone} signed={tone === 'accent'} className="mt-0.5 max-lg:!text-[16px]" />
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{hint}</p>}
    </div>
  )
}

/** Una fila de la leyenda del donut — punto de color, nombre, barrita proporcional (oculta en
 *  mobile), % y monto. La usan tanto las categorías del top como las que quedaron detrás de
 *  "Otros" una vez expandido — mismo markup para las dos. */
function CategoryLegendRow({
  name,
  color,
  cents,
  pct,
  dim,
  onClick,
}: {
  name: string
  color: string
  cents: number
  pct: number
  dim: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-chip py-2 text-left transition-opacity hover:opacity-70"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', dim ? 'text-fg-muted' : 'text-fg')}>{name}</span>
        <span className="hidden h-[5px] w-24 shrink-0 overflow-hidden rounded-pill bg-fill-subtle sm:block">
          <span className="block h-full rounded-pill" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
        </span>
        <span className="tnum w-9 shrink-0 text-right text-[12px] text-fg-muted">{Math.round(pct * 100)}%</span>
        <Money cents={cents} tone={dim ? 'dim' : 'fg'} size="row" className="w-24 shrink-0 justify-end" />
      </button>
    </li>
  )
}

/** Una fila de la tabla de promedios — punto de color, nombre, promedio, mes actual y desvío. La
 *  usan las categorías del top y las que quedaron detrás de "Otros" una vez expandida — mismo
 *  markup para las dos, igual que `CategoryLegendRow` en el donut. */
function PromedioRow({
  name,
  color,
  avgCents,
  nowCents,
  deviationPct,
  dim,
}: {
  name: string
  color: string
  avgCents: number
  nowCents: number
  deviationPct: number | null
  dim?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border-b border-divider py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className={cn('truncate text-[13px]', dim ? 'text-fg-muted' : 'text-fg')}>{name}</span>
      </span>
      <Money cents={avgCents} tone="dim" size="row" className="w-20 shrink-0 justify-end" />
      <Money cents={nowCents} tone={dim ? 'dim' : 'fg'} size="row" className="w-20 shrink-0 justify-end" />
      <span
        className={cn(
          'tnum w-12 shrink-0 text-right text-[12px] font-semibold',
          deviationPct == null ? 'text-fg-muted' : deviationPct > 0 ? 'text-negative' : 'text-accent',
        )}
      >
        {deviationPct == null ? '—' : `${deviationPct > 0 ? '+' : ''}${deviationPct}%`}
      </span>
    </div>
  )
}

export function Analisis() {
  const cycleConfig = useCycleConfig()
  const [period, setPeriod] = useState(() => defaultPeriod(cycleConfig))
  const [otrosExpanded, setOtrosExpanded] = useState(false)
  const [promedioOtrosExpanded, setPromedioOtrosExpanded] = useState(false)
  const navigate = useNavigate()
  const chartColors = useChartColors()

  // `range`/`prevRange` son el rango YA RESUELTO de `period` contra el ciclo configurado — con
  // `preset === 'month'` no se lee `period.from`/`.to` directo en ningún lado de acá para abajo,
  // así que no importa si quedaron desactualizados frente a `cycleConfig` (p.ej. recién cargó el
  // perfil): siempre se recalculan acá. Ver `presetToRange`/`comparisonRange` en `period.ts`.
  const range = useMemo(
    () => (period.preset === 'custom' ? { from: period.from, to: period.to } : presetToRange(period.preset, period.anchor, cycleConfig)),
    [period, cycleConfig],
  )
  const prevRange = useMemo(() => comparisonRange(period, range, cycleConfig), [period, range, cycleConfig])
  const cycle = useMemo(() => cycleContaining(cycleConfig, parseISO(period.anchor)), [cycleConfig, period.anchor])

  const spendQuery = useSpendByCategory(range.from, range.to)
  const prevTotalQuery = usePreviousPeriodTotal(prevRange.from, prevRange.to)
  const comparisonQuery = useTopCategoriesComparison(range.from, range.to, prevRange.from, prevRange.to)
  const transactionsQuery = useTransactions({ from: range.from, to: range.to, type: 'expense' })
  const { data: committedPurchaseIds } = useCommittedPurchaseTransactionIds()
  const monthlySeriesQuery = useCategoryMonthlySeries(period.anchor)
  // Exacto cuando `range.from`/`.to` están alineados a mes entero (todos los presets salvo
  // "Personalizado" con ciclo mensual — ver `presetToRange`): el RPC agrupa por mes calendario, así
  // que un rango que no calza con meses enteros (quincena, semana, "Personalizado" a mitad de mes)
  // va a incluir esos días igual. Aceptado: el desvío es chico y el gráfico se queda mensual a
  // propósito (ver "Qué se queda mensual a propósito" en el plan de ciclos).
  const incomeSeriesQuery = useMonthlySeries(range.from, range.to)

  const { data: spend } = spendQuery
  const { data: comparison } = comparisonQuery
  const { data: transactions } = transactionsQuery
  const { data: monthlySeries } = monthlySeriesQuery

  const totalCents = (spend ?? []).reduce((acc, s) => acc + s.cents, 0)
  const incomeCents = (incomeSeriesQuery.data ?? []).reduce((acc, p) => acc + p.incomeCents, 0)
  const netCents = incomeCents - totalCents
  const prevTotalCents = prevTotalQuery.data ?? 0
  const days = Math.max(1, differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1)
  const prevDays = Math.max(1, differenceInCalendarDays(parseISO(prevRange.to), parseISO(prevRange.from)) + 1)
  // Por PROMEDIO diario, no por total crudo — con `preset === 'month'` el período anterior puede
  // tener otra cantidad de días (una quincena de 15 contra una de 13–16), y comparar los totales
  // sin más sería peras contra manzanas. Cuando `days === prevDays` (siempre en '3m'/'custom', y en
  // 'month' con ciclo mensual) da exactamente el mismo % que comparar totales — cero regresión.
  const changePct = prevTotalCents > 0 ? ((totalCents / days - prevTotalCents / prevDays) / (prevTotalCents / prevDays)) * 100 : null

  const fijoVsVariable = useMemo(
    () => summarizeFijoVsVariable(transactions ?? [], committedPurchaseIds ?? new Set()),
    [transactions, committedPurchaseIds],
  )
  const promedioMensual = useMemo(() => summarizeCategoryMonthlyAverages(monthlySeries ?? []), [monthlySeries])

  // `spend` ya viene ordenado desc por `useSpendByCategory` — acá sólo se corta. Con 6 o menos
  // categorías `rest` queda vacío (ver la regla `n + 1` de `splitTopN`) y todo se muestra igual
  // que antes.
  const { top: topCategories, rest: restCategories, restCents } = useMemo(() => splitTopN(spend ?? [], TOP_CATEGORIES_N), [spend])
  const donutData = useMemo(
    () =>
      restCategories.length > 0
        ? [...topCategories, { categoryId: OTROS_ID, categoryName: 'Otros', color: chartColors.fgMuted, cents: restCents }]
        : topCategories,
    [topCategories, restCategories, restCents, chartColors.fgMuted],
  )

  // Mismo corte que el donut — `promedioMensual.rows` ya viene ordenado desc por `nowCents`
  // (ver `summarizeCategoryMonthlyAverages`), así que `splitTopN` corta en el mismo punto que la
  // leyenda. `cents: nowCents` es sólo para que `splitTopN` sepa por dónde cortar/sumar; el resto
  // de los campos del row viaja intacto.
  const {
    top: promedioTop,
    rest: promedioRest,
    restCents: promedioRestNowCents,
  } = useMemo(
    () => splitTopN(promedioMensual.rows.map((r) => ({ ...r, cents: r.nowCents })), TOP_CATEGORIES_N),
    [promedioMensual.rows],
  )
  // Sin desvío agregado para "Otros": promediar el desvío de categorías sin relación entre sí no
  // dice nada útil — el chevron ocupa ese lugar en vez de un % que confundiría más que ayudaría.
  const promedioRestAvgCents = useMemo(() => promedioRest.reduce((sum, r) => sum + r.avgCents, 0), [promedioRest])

  // "septiembre" (sin año) — idéntico al copy de siempre cuando el ciclo es mensual (el caso común).
  // Con `preset === 'month'` y un ciclo más chico (quincena/semana), `cycleLabel` ya trae su propio
  // formato ("1–15 sep 2026") — no hay un solo nombre de mes que lo represente.
  const anchorMonthLabel = format(parseISO(cycle.from), 'MMMM', { locale: es })
  // El hero dice "en {mes}" sólo cuando el preset ES 'month' y el ciclo es mensual — en cualquier
  // otro caso (3/6/12 meses, personalizado, o quincena/semana) el gasto no corresponde a un solo
  // mes, así que hablar de "agosto" sería directamente incorrecto, no sólo impreciso.
  const heroPeriodLabel =
    period.preset !== 'month' ? periodRangeLabel(range) : cycleConfig.kind === 'monthly' ? anchorMonthLabel : cycleLabel(cycle)
  const heroPrevPeriodLabel =
    period.preset === 'month' && cycleConfig.kind === 'monthly'
      ? format(parseISO(prevRange.from), 'MMMM', { locale: es })
      : 'el período anterior'
  const promedioMesesLabel =
    promedioMensual.monthsCounted === 0
      ? null
      : promedioMensual.monthsCounted === 1
        ? 'último mes'
        : `últimos ${promedioMensual.monthsCounted} meses`

  function goToCategory(categoryId: string) {
    if (categoryId === OTROS_ID) {
      setOtrosExpanded((v) => !v)
      return
    }
    navigate('/movimientos', { state: { categoryId, period: movementPeriodFromRange(range.from, range.to) } })
  }

  const isPending = spendQuery.isPending || comparisonQuery.isPending
  const isError = spendQuery.isError

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <h1 className="font-display text-figure font-semibold">Análisis</h1>
          {period.preset === 'month' && (
            <CycleNav
              cycle={cycle}
              onPrev={() => setPeriod((p) => shiftPeriodMonth(p, -1, cycleConfig))}
              onNext={() => setPeriod((p) => shiftPeriodMonth(p, 1, cycleConfig))}
            />
          )}
        </div>

        <div className="hidden lg:block">
          {period.preset === 'month' ? (
            <CycleNav
              cycle={cycle}
              onPrev={() => setPeriod((p) => shiftPeriodMonth(p, -1, cycleConfig))}
              onNext={() => setPeriod((p) => shiftPeriodMonth(p, 1, cycleConfig))}
            />
          ) : (
            <p className="eyebrow">{periodRangeLabel(range)}</p>
          )}
          <h1 className="mt-2 font-display text-figure font-semibold">Análisis</h1>
        </div>

        <PeriodSelector value={period} onChange={setPeriod} config={cycleConfig} />
      </header>

      {isError ? (
        <Panel className="px-6 py-10">
          <ErrorState onRetry={() => spendQuery.refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full rounded-panel" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr]">
            <div className="flex flex-col gap-4">
              <Skeleton className="h-64 w-full rounded-panel" />
              <Skeleton className="h-48 w-full rounded-panel" />
            </div>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-48 w-full rounded-panel" />
              <Skeleton className="h-48 w-full rounded-panel" />
            </div>
          </div>
        </div>
      ) : !spend || spend.length === 0 ? (
        <Panel>
          <EmptyState glyph="◔" title="No hay gastos en este período" hint="Probá con un rango más amplio." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-6 p-[18px] lg:flex-row lg:items-center lg:gap-9 lg:p-6">
            <div className="flex-none text-center lg:text-left">
              <p className="eyebrow">Gastaste en {heroPeriodLabel}</p>
              <div className="mt-1 flex items-baseline justify-center gap-3 lg:justify-start">
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

            {/* Mobile: grilla de 3 columnas parejas y centradas, con un divisor arriba separándola
                del hero — antes era el mismo `flex flex-wrap` de escritorio, que en mobile hacía que
                "Por día" (el tercer ítem) bajara solo a una segunda línea pegado a la izquierda,
                desalineado del resto. Desktop sigue con `flex-wrap` (ver comentario original): nunca
                `flex-nowrap` ni `grid-cols-3` ahí porque los dos fuerzan un ancho fijo por columna, y
                entre ~1024 y ~1250px eso corta el último dígito de "Por día" contra el borde del
                panel — se vio con capturas reales. */}
            <div className="grid grid-cols-3 gap-3 border-t border-divider pt-4 text-center lg:flex lg:flex-1 lg:flex-wrap lg:gap-x-8 lg:gap-y-3 lg:border-t-0 lg:pt-0 lg:text-left">
              <HeroStat label="Ingresos" cents={incomeCents} tone="fg" className="lg:border-l lg:border-divider lg:pl-8" />
              <HeroStat
                label="Neto"
                cents={netCents}
                tone={netCents >= 0 ? 'accent' : 'negative'}
                className="lg:border-l lg:border-divider lg:pl-8"
              />
              <HeroStat
                label="Por día"
                cents={Math.round(totalCents / days)}
                tone="fg"
                hint={`sobre ${days} días`}
                className="lg:border-l lg:border-divider lg:pl-8"
              />
            </div>
          </Panel>

          {/* Columna + rail, mismo patrón que Fijos/Mis Deudas/Ahorros: los paneles que crecen con
              la cantidad de categorías (donut, promedio mensual) van apilados en la columna ancha;
              los de contenido corto y fijo (fijo vs. variable, top categorías) van en el rail. Así
              ningún panel compite en altura contra un vecino de la misma fila. */}
          {/* En mobile los 4 paneles son items directos de este grid (las dos columnas de abajo
              pasan a `contents` y desaparecen del árbol de layout) para poder reordenarlos con
              `order-*` sin tocar el armado de 2 columnas de escritorio: acá el orden pedido es
              Gráfico, Fijo vs. variable, Top categorías, Promedio mensual — distinto del orden
              columna-por-columna que tiene sentido en desktop. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr] lg:items-start">
            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <Panel className="order-1 p-6 lg:order-none">
                <p className="eyebrow">En qué se fue la plata</p>
                <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row lg:gap-8">
                  <CategoryDonut data={donutData} onSelect={goToCategory} centerLabel="gasto" size={196} />
                  <ul className="flex w-full min-w-0 flex-col gap-1">
                    {topCategories.map((s, i) => (
                      <CategoryLegendRow
                        key={s.categoryId}
                        name={s.categoryName}
                        color={s.color}
                        cents={s.cents}
                        pct={totalCents > 0 ? s.cents / totalCents : 0}
                        dim={i !== 0}
                        onClick={() => goToCategory(s.categoryId)}
                      />
                    ))}

                    {restCategories.length > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setOtrosExpanded((v) => !v)}
                          aria-expanded={otrosExpanded}
                          className="flex w-full items-center gap-3 rounded-chip py-2 text-left transition-opacity hover:opacity-70"
                        >
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors.fgMuted }} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-muted">
                            Otros {restCategories.length} categoría{restCategories.length === 1 ? '' : 's'}
                          </span>
                          <span className="tnum w-9 shrink-0 text-right text-[12px] text-fg-muted">
                            {totalCents > 0 ? Math.round((restCents / totalCents) * 100) : 0}%
                          </span>
                          <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                            <Money cents={restCents} tone="dim" size="row" />
                            <ChevronRight
                              className={cn('size-3 shrink-0 text-fg-muted transition-transform duration-150', otrosExpanded && 'rotate-90')}
                              strokeWidth={1.8}
                              aria-hidden
                            />
                          </span>
                        </button>
                        {otrosExpanded && (
                          <ul className="flex flex-col gap-1 pl-5">
                            {restCategories.map((s) => (
                              <CategoryLegendRow
                                key={s.categoryId}
                                name={s.categoryName}
                                color={s.color}
                                cents={s.cents}
                                pct={totalCents > 0 ? s.cents / totalCents : 0}
                                dim
                                onClick={() => goToCategory(s.categoryId)}
                              />
                            ))}
                          </ul>
                        )}
                      </li>
                    )}
                  </ul>
                </div>
              </Panel>

              <Panel className="order-4 p-6 lg:order-none">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">Promedio mensual por categoría</p>
                  {promedioMesesLabel && <span className="text-[11.5px] text-fg-muted">{promedioMesesLabel}</span>}
                </div>
                {monthlySeriesQuery.isError ? (
                  <ErrorState onRetry={() => monthlySeriesQuery.refetch()} className="mt-4" />
                ) : monthlySeriesQuery.isPending ? (
                  <div className="mt-4 flex flex-col gap-3">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-5 w-full" />
                    ))}
                  </div>
                ) : promedioMensual.rows.length === 0 ? (
                  <EmptyState glyph="▤" title="Todavía no hay datos" className="py-8" />
                ) : (
                  <div className="mt-3.5">
                    <div className="flex items-center gap-3 border-b border-divider pb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">
                      <span className="min-w-0 flex-1">Categoría</span>
                      <span className="w-20 shrink-0 text-right">Promedio</span>
                      <span className="w-20 shrink-0 text-right">{anchorMonthLabel}</span>
                      <span className="w-12 shrink-0 text-right">Desvío</span>
                    </div>
                    {promedioTop.map((p) => (
                      <PromedioRow
                        key={p.categoryId}
                        name={p.categoryName}
                        color={p.color}
                        avgCents={p.avgCents}
                        nowCents={p.nowCents}
                        deviationPct={p.deviationPct}
                      />
                    ))}

                    {promedioRest.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPromedioOtrosExpanded((v) => !v)}
                          aria-expanded={promedioOtrosExpanded}
                          className="flex w-full items-center gap-3 border-b border-divider py-2.5 text-left last:border-b-0"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors.fgMuted }} />
                            <span className="truncate text-[13px] text-fg-muted">
                              Otros {promedioRest.length} categoría{promedioRest.length === 1 ? '' : 's'}
                            </span>
                          </span>
                          <Money cents={promedioRestAvgCents} tone="dim" size="row" className="w-20 shrink-0 justify-end" />
                          <Money cents={promedioRestNowCents} tone="dim" size="row" className="w-20 shrink-0 justify-end" />
                          <span className="flex w-12 shrink-0 items-center justify-end">
                            <ChevronRight
                              className={cn(
                                'size-3 shrink-0 text-fg-muted transition-transform duration-150',
                                promedioOtrosExpanded && 'rotate-90',
                              )}
                              strokeWidth={1.8}
                              aria-hidden
                            />
                          </span>
                        </button>
                        {promedioOtrosExpanded &&
                          promedioRest.map((p) => (
                            <PromedioRow
                              key={p.categoryId}
                              name={p.categoryName}
                              color={p.color}
                              avgCents={p.avgCents}
                              nowCents={p.nowCents}
                              deviationPct={p.deviationPct}
                              dim
                            />
                          ))}
                      </>
                    )}
                  </div>
                )}
              </Panel>
            </div>

            <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
              <Panel className="order-2 p-6 lg:order-none">
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
                        {fijoVsVariable.variablePct}% del gasto ·{' '}
                        <Money cents={Math.round(fijoVsVariable.variableCents / days)} tone="dim" size="inline" /> por día
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-[11.5px] leading-relaxed text-fg-muted">
                  De cada $100 que gastaste, ${fijoVsVariable.committedPct} ya estaban decididos antes de que arrancara el período.
                </p>
              </Panel>

              <Panel className="order-3 p-6 lg:order-none">
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
