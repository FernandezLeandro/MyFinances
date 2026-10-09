import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { FilterChip } from '@/components/ui/Chip'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { MonthNav } from '@/components/ui/MonthNav'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney, formatQuantity, type Currency } from '@/lib/money'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useChartColors } from '@/lib/chartColors'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import { useAssets } from '@/features/assets/api'
import { useAssetPrices, useDollarQuotes, useUsdRate } from '@/features/fx/api'
import { useInvestments, type Investment } from '@/features/investments/api'
import {
  UNCATEGORIZED,
  byCategory,
  filterInvestments,
  investedBySlot,
  positionsByAsset,
  summarize,
} from '@/features/investments/aggregate'
import { useInvestmentFilters } from '@/features/investments/filters'
import {
  GRANULARITIES,
  GRANULARITY_LABELS,
  rangeFor,
  rangeLabel,
  shiftAnchor,
  slotsFor,
  type Granularity,
} from '@/features/investments/period'
import { InvestmentFormDialog } from '@/features/investments/InvestmentFormDialog'
import { CategoryFilterDialog } from '@/features/investments/CategoryFilterDialog'
import { InvestedChart } from '@/features/investments/InvestedChart'
import { GainFigure, PositionsPanel } from '@/features/investments/PositionsPanel'

const CURRENCY_OPTIONS = [
  { value: 'ARS' as const, label: 'ARS' },
  { value: 'USD' as const, label: 'USD' },
]

const GRANULARITY_OPTIONS = GRANULARITIES.map((g) => ({ value: g, label: GRANULARITY_LABELS[g] }))

const CHART_TITLE: Record<Granularity, string> = {
  week: 'Invertido por día',
  month: 'Invertido por semana',
  year: 'Invertido por mes',
  all: 'Invertido por año',
}

const NAV_LABELS: Record<Granularity, { prev: string; next: string }> = {
  week: { prev: 'Semana anterior', next: 'Semana siguiente' },
  month: { prev: 'Mes anterior', next: 'Mes siguiente' },
  year: { prev: 'Año anterior', next: 'Año siguiente' },
  all: { prev: '', next: '' },
}

/** Cuántas filas del historial se ven antes de «Ver más». */
const HISTORY_PAGE = 15

function SecondaryFigure({
  label,
  cents,
  currency,
  tone = 'fg',
  signed,
  hidden,
}: {
  label: string
  cents: number
  currency: Currency
  tone?: 'fg' | 'accent' | 'negative' | 'dim'
  signed?: boolean
  hidden?: boolean
}) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} currency={currency} tone={tone} signed={signed} size="figure" className="mt-0.5" hidden={hidden} />
    </div>
  )
}

export function Inversiones() {
  const { data: investments, isPending: isInvestmentsPending, isError, refetch } = useInvestments()
  const { data: assets, isPending: isAssetsPending } = useAssets(true)
  const { data: categories, isPending: isCategoriesPending } = useCategories(true)
  const prices = useAssetPrices()
  const { quotes } = useDollarQuotes()
  const usdRate = useUsdRate()
  const chartColors = useChartColors()

  const [filters, setFilters] = useInvestmentFilters()
  const [anchor, setAnchor] = useState(() => new Date())
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('ARS')
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('inversiones-total')
  const [form, setForm] = useState<{ investment: Investment | null } | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [shown, setShown] = useState(HISTORY_PAGE)

  const isPending = isInvestmentsPending || isAssetsPending || isCategoriesPending

  const investmentCategories = useMemo(() => (categories ?? []).filter((c) => c.kind === 'investment' && !c.is_archived), [categories])
  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const all = useMemo(() => investments ?? [], [investments])
  const assetList = useMemo(() => assets ?? [], [assets])

  // Lo guardado puede apuntar a categorías que ya no existen: se ignoran (si no queda ninguna, son todas).
  const selectedIds = useMemo(
    () => filters.categoryIds.filter((id) => id === UNCATEGORIZED || categoryById.has(id)),
    [filters.categoryIds, categoryById],
  )
  const range = rangeFor(filters.granularity, anchor)

  const filtered = useMemo(() => filterInvestments(all, { categoryIds: selectedIds, range }), [all, selectedIds, range])
  const summary = useMemo(() => summarize(filtered, assetList, prices, quotes), [filtered, assetList, prices, quotes])
  const positions = useMemo(() => positionsByAsset(filtered, assetList, prices, quotes), [filtered, assetList, prices, quotes])
  const slices = useMemo(
    () => byCategory(filtered, categories ?? [], assetList, prices, quotes),
    [filtered, categories, assetList, prices, quotes],
  )
  const earliest = useMemo(() => all.reduce<string | null>((min, inv) => (min == null || inv.occurred_on < min ? inv.occurred_on : min), null), [all])
  const bars = useMemo(() => {
    const slots = slotsFor(filters.granularity, anchor, earliest)
    const invested = investedBySlot(filtered, slots)
    return slots.map((s, i) => ({ label: s.label, cents: invested[i] }))
  }, [filters.granularity, anchor, earliest, filtered])

  // Todo el estado interno vive en ARS: esto sólo convierte para MOSTRAR, con el «Dólar en uso».
  function toDisplay(arsCents: number | null): number | null {
    if (arsCents == null) return null
    if (displayCurrency === 'ARS') return arsCents
    return usdRate.rateCents == null ? null : Math.round((arsCents * 100) / usdRate.rateCents)
  }

  const valueDisplay = toDisplay(summary.valueCents)
  const investedDisplay = toDisplay(summary.investedCents)
  const gainDisplay = toDisplay(summary.gainCents)
  const usdValue = displayCurrency === 'ARS' && summary.valueCents != null && usdRate.rateCents != null ? Math.round((summary.valueCents * 100) / usdRate.rateCents) : null

  const hasUncategorized = all.some((inv) => !inv.category_id || !categoryById.has(inv.category_id))
  const history = filtered
  const visibleHistory = history.slice(0, shown)

  function setGranularity(g: Granularity) {
    setFilters({ ...filters, granularity: g })
    setAnchor(new Date())
    setShown(HISTORY_PAGE)
  }

  function setCategoryIds(ids: string[]) {
    setFilters({ ...filters, categoryIds: ids })
    setShown(HISTORY_PAGE)
  }

  const donutData = slices.map((s) => ({ categoryId: s.categoryId, categoryName: s.name, color: s.color, cents: s.investedCents }))
  const totalInvested = slices.reduce((sum, s) => sum + s.investedCents, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Inversiones</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Lo que tenés invertido</h1>
          <p className="mt-2 max-w-md text-[13px] text-fg-muted">Aparte del saldo del mes: no afecta a Hoy ni a Análisis.</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedToggle value={displayCurrency} onChange={setDisplayCurrency} options={CURRENCY_OPTIONS} />
          <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="inversiones" />
          <Button size="compact" onClick={() => setForm({ investment: null })} icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}>
            Nueva inversión
          </Button>
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-4">
          <Panel className="p-panel">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-11 w-56" />
          </Panel>
          <Panel className="p-panel">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-14 w-full" />
          </Panel>
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          glyph="◈"
          title="Todavía no cargaste inversiones"
          hint="Ahorros, fondo de emergencia, jubilación, dólares, cripto… cada inversión que hagas queda en tu historial."
          action={<Button onClick={() => setForm({ investment: null })}>Nueva inversión</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Filtros: período y categorías. Se recuerdan en este dispositivo. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedToggle variant="pill" value={filters.granularity} onChange={setGranularity} options={GRANULARITY_OPTIONS} />
              {filters.granularity !== 'all' && (
                <MonthNav
                  label={rangeLabel(filters.granularity, anchor)}
                  onPrev={() => setAnchor(shiftAnchor(filters.granularity, anchor, -1))}
                  onNext={() => setAnchor(shiftAnchor(filters.granularity, anchor, 1))}
                  prevLabel={NAV_LABELS[filters.granularity].prev}
                  nextLabel={NAV_LABELS[filters.granularity].next}
                />
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
              {selectedIds.length === 0 ? 'Todas las categorías' : `${selectedIds.length} categoría${selectedIds.length === 1 ? '' : 's'}`}
            </Button>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => (
                <FilterChip
                  key={id}
                  removeLabel={`Quitar ${id === UNCATEGORIZED ? 'Sin categoría' : categoryById.get(id)?.name}`}
                  onRemove={() => setCategoryIds(selectedIds.filter((x) => x !== id))}
                >
                  {id === UNCATEGORIZED ? 'Sin categoría' : categoryById.get(id)?.name}
                </FilterChip>
              ))}
            </div>
          )}

          {/* Resumen del filtro: valor de hoy y lo que se ganó o perdió sobre lo pagado. */}
          <Panel className="p-panel lg:p-7">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-11">
              <div className="shrink-0">
                <p className="eyebrow">Valor actual</p>
                {valueDisplay == null ? (
                  <p className="mt-2 text-[15px] text-fg-secondary">Cotización no disponible</p>
                ) : (
                  <Money cents={valueDisplay} currency={displayCurrency} tone="fg" size="hero" className="mt-1" hidden={balanceHidden} />
                )}
                <p className="mt-2 text-[12px] text-fg-muted">
                  {filtered.length} {filtered.length === 1 ? 'inversión' : 'inversiones'} · {rangeLabel(filters.granularity, anchor)}
                </p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-8 border-t border-divider pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
                {investedDisplay != null && <SecondaryFigure label="Invertido" cents={investedDisplay} currency={displayCurrency} tone="dim" hidden={balanceHidden} />}
                {gainDisplay != null && (
                  <div>
                    <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Ganancia</p>
                    <div className="mt-1.5">
                      <GainFigure cents={gainDisplay} pct={summary.gainPct} currency={displayCurrency} hidden={balanceHidden} />
                    </div>
                  </div>
                )}
                {usdValue != null && usdRate.rateCents != null && (
                  <div>
                    <SecondaryFigure label="En dólares" cents={usdValue} currency="USD" hidden={balanceHidden} />
                    <p className="mt-0.5 text-[11px] text-fg-muted">1 USD = {formatMoney(usdRate.rateCents)}</p>
                  </div>
                )}
              </div>
            </div>
          </Panel>

          <Panel className="p-panel">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em] text-fg">{CHART_TITLE[filters.granularity]}</h2>
            <div className="mt-4">
              <InvestedChart data={bars.map((b) => ({ label: b.label, cents: toDisplay(b.cents) ?? 0 }))} />
            </div>
          </Panel>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <PositionsPanel positions={positions} summary={summary} toDisplay={toDisplay} currency={displayCurrency} hidden={balanceHidden} />

            <Panel className="p-panel">
              <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em] text-fg">Por categoría</h2>
              {slices.length === 0 || totalInvested === 0 ? (
                <p className="mt-3 text-[13px] text-fg-muted">Sin inversiones en este período.</p>
              ) : (
                <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
                  <CategoryDonut
                    data={donutData.map((d) => ({ ...d, cents: toDisplay(d.cents) ?? 0 }))}
                    centerOverride={{ eyebrow: '', value: `${Math.round((slices[0].investedCents / totalInvested) * 100)}%` }}
                    size={140}
                  />
                  <ul className="w-full min-w-0 flex-1">
                    {slices.map((s) => {
                      const gain = toDisplay(s.gainCents)
                      return (
                        <li key={s.categoryId} className="flex items-center gap-3 py-2">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? chartColors.fgMuted }} />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{s.name}</span>
                          <span className="flex shrink-0 flex-col items-end">
                            <Money cents={toDisplay(s.investedCents) ?? 0} currency={displayCurrency} tone="dim" size="row" hidden={balanceHidden} />
                            {gain != null && gain !== 0 && (
                              <Money cents={gain} currency={displayCurrency} tone={gain < 0 ? 'negative' : 'accent'} signed size="row" hidden={balanceHidden} />
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </Panel>
          </div>

          <Panel>
            <CardHeader title="Historial" action={<span className="text-[11.5px] text-fg-muted">{history.length} {history.length === 1 ? 'inversión' : 'inversiones'}</span>} />
            {history.length === 0 ? (
              <p className="px-panel pt-2 pb-5 text-[13px] text-fg-muted">Sin inversiones con estos filtros.</p>
            ) : (
              <ul className="pb-2">
                {visibleHistory.map((inv) => {
                  const category = inv.category_id ? categoryById.get(inv.category_id) : undefined
                  const asset = assetList.find((a) => a.id === inv.asset_id)
                  const isArs = asset?.symbol === 'ARS'
                  const cost = toDisplay(Math.round(Number(inv.amount) * 100))
                  return (
                    <li key={inv.id} className="border-t border-divider first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setForm({ investment: inv })}
                        className="flex w-full items-center gap-3 px-panel py-3 text-left transition-colors duration-150 hover:bg-fill-subtle"
                      >
                        <CategoryChip color={category?.color ?? '#A0A0A8'} icon={category?.icon ?? 'tag'} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-fg">{inv.description || category?.name || 'Sin categoría'}</span>
                          <span className="tnum block text-[12px] text-fg-muted">
                            {format(parseISO(inv.occurred_on), "d MMM yyyy", { locale: es })}
                            {asset && !isArs && ` · ${formatQuantity(Math.round(Number(inv.quantity) * 10 ** asset.decimals), asset.decimals)} ${asset.symbol}`}
                            {inv.buy_price && ` · a ${formatMoney(Math.round(Number(inv.buy_price) * 100))}`}
                          </span>
                        </span>
                        {cost != null && <Money cents={cost} currency={displayCurrency} tone="fg" size="row" hidden={balanceHidden} className="shrink-0" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {history.length > shown && (
              <div className="border-t border-divider px-panel py-3">
                <button type="button" onClick={() => setShown(shown + HISTORY_PAGE)} className="text-[12.5px] font-semibold text-accent hover:opacity-70">
                  Ver más
                </button>
              </div>
            )}
          </Panel>
        </div>
      )}

      {form && (
        <InvestmentFormDialog key={form.investment?.id ?? 'new'} open onClose={() => setForm(null)} investment={form.investment} />
      )}
      {filterOpen && (
        <CategoryFilterDialog
          open
          onClose={() => setFilterOpen(false)}
          categories={investmentCategories}
          selected={selectedIds}
          hasUncategorized={hasUncategorized}
          onApply={(ids) => {
            setCategoryIds(ids)
            setFilterOpen(false)
          }}
        />
      )}
    </div>
  )
}
