import { useState } from 'react'
import { ChevronRight, Pencil, Plus } from 'lucide-react'
import { format, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { IconSquare } from '@/components/ui/IconSquare'
import { Money } from '@/components/ui/Money'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { StackedBar } from '@/components/ui/StackedBar'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatMoney, formatQuantity, type Currency } from '@/lib/money'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useChartColors } from '@/lib/chartColors'
import { splitTopN } from '@/lib/topN'
import { useSavingsBuckets, useSavingsEntries, type SavingsBucket } from '@/features/savings/api'
import { summarizePortfolio, assetSlices, type BucketSummary } from '@/features/savings/aggregate'
import { CompositionView } from '@/features/savings/CompositionView'
import { useAssets, type Asset } from '@/features/assets/api'
import { useAssetPrices } from '@/features/fx/api'
import { BucketFormDialog } from '@/features/savings/BucketFormDialog'
import { BucketDetailDialog } from '@/features/savings/BucketDetailDialog'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'

const CURRENCY_OPTIONS = [
  { value: 'ARS' as const, label: 'ARS' },
  { value: 'USD' as const, label: 'USD' },
]

/** Máximo de activos individuales en el donut de composición — el resto se agrupa en "Otros N
 *  activos", igual criterio que las categorías de Análisis (ahí son 6, acá 4 porque el mock corta a
 *  5 filas totales contando "Otros"). */
const ASSETS_TOP_N = 4
/** Máximo de chips de activo visibles por ítem antes de "+N activos" — mismo motivo (la fila no
 *  crece sin límite cuando un ítem mezcla muchos activos). */
const ITEM_CHIPS_MAX = 3
const OTROS_ASSET_ID = '__otros__'

/** Todo el estado interno de Ahorros vive en ARS — esto sólo convierte para MOSTRAR. */
function toDisplayCents(arsCents: number | null, currency: Currency, usdRateCents: number | null): number | null {
  if (arsCents == null) return null
  if (currency === 'ARS') return arsCents
  if (usdRateCents == null) return null
  return Math.round((arsCents * 100) / usdRateCents)
}

function usdUpdatedLabel(updatedAt: string | null): string | null {
  if (!updatedAt) return null
  const date = parseISO(updatedAt)
  const when = isSameDay(date, new Date()) ? `hoy ${format(date, 'HH:mm')}` : format(date, "d 'de' MMMM, HH:mm", { locale: es })
  return `Cotización del dólar actualizada ${when}.`
}

function SecondaryFigure({
  label,
  cents,
  currency,
  tone = 'fg',
  signed,
  hint,
}: {
  label: string
  cents: number
  currency: Currency
  tone?: 'fg' | 'accent' | 'negative' | 'dim'
  signed?: boolean
  hint?: string
}) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} currency={currency} tone={tone} signed={signed} size="figure" className="mt-0.5" />
      {hint && <p className={cn('mt-0.5 text-[11px]', tone === 'accent' ? 'text-accent' : 'text-fg-muted')}>{hint}</p>}
    </div>
  )
}

/** Una fila de la leyenda del donut de composición — punto de color, símbolo, % y monto. Mismo
 *  markup para el top 4 y para los activos que quedaron detrás de "Otros" una vez expandido. */
function AssetLegendRow({
  name,
  color,
  cents,
  pct,
  currency,
  dim,
}: {
  name: string
  color: string
  cents: number
  pct: number
  currency: Currency
  dim?: boolean
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', dim ? 'text-fg-muted' : 'text-fg')}>{name}</span>
      <span className="flex items-baseline gap-3">
        <span className="tnum w-9 shrink-0 text-right text-[12px] text-fg-muted">{Math.round(pct)}%</span>
        {/* `min-w` a propósito, no `w`: con un ancho fijo + `justify-end`, un monto en USD (más
            ancho que uno en ARS — el toggle de moneda de arriba lo permite) desborda hacia la
            IZQUIERDA y termina superpuesto con el % — visto con datos reales en la cuenta de
            prueba. `min-w` deja una columna prolija para montos cortos sin recortar los largos. */}
        <Money cents={cents} currency={currency} tone="dim" size="row" className="min-w-20 shrink-0 justify-end" />
      </span>
    </li>
  )
}

/**
 * Fila de "Tus ítems" — nombre + badge + hasta 3 chips de activo (el resto en un "+N activos" que
 * abre el historial) + meta (sólo si el ítem la tiene) + valor + acciones. Reemplaza la vieja
 * `BucketCard` en grilla: el mock 15a los pide como lista de filas, no tarjetas — con un solo valor
 * por ítem la tarjeta grande quedaba vacía.
 *
 * Igual patrón que `ReceivableRow` (Me Deben): el nombre/chips van en un `<button>` que abre el
 * historial (que ya tiene "Nuevo aporte" en su footer) — así mobile, que esconde los botones de
 * acción de escritorio, sigue teniendo un camino para entrar. Escritorio suma "Historial" y el "+"
 * explícitos al lado, como hermanos del botón (nunca anidados: dos `<button>` uno dentro del otro
 * es HTML inválido).
 */
function ItemRow({
  summary,
  assets,
  displayCurrency,
  usdRateCents,
  globalHidden,
  onEdit,
  onOpenDetail,
  onQuickEntry,
}: {
  summary: BucketSummary
  assets: Asset[]
  displayCurrency: Currency
  usdRateCents: number | null
  globalHidden: boolean
  onEdit: (b: SavingsBucket) => void
  onOpenDetail: (b: SavingsBucket) => void
  onQuickEntry: (b: SavingsBucket) => void
}) {
  const { bucket, nets, valueCents } = summary
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const heldNets = nets.filter((n) => n.quantityUnits !== 0)
  const chips = heldNets
    .map((n) => {
      const asset = assetById.get(n.assetId)
      if (!asset) return null
      return `${asset.symbol} ${formatQuantity(n.quantityUnits, asset.decimals)}`
    })
    .filter((c): c is string => c != null)
  const visibleChips = chips.slice(0, ITEM_CHIPS_MAX)
  const restChipCount = chips.length - visibleChips.length

  const [itemHidden, toggleItemHidden] = useHiddenBalance(`ahorros-item-${bucket.id}`)
  const hidden = globalHidden || itemHidden

  const displayValueCents = toDisplayCents(valueCents, displayCurrency, usdRateCents)
  const displayGoalCents = toDisplayCents(bucket.goal_cents, displayCurrency, usdRateCents)
  const goalPct = bucket.goal_cents != null && valueCents != null ? Math.min(100, Math.round((valueCents / bucket.goal_cents) * 100)) : null
  const faltaDisplayCents =
    displayGoalCents != null && displayValueCents != null ? Math.max(0, displayGoalCents - displayValueCents) : null

  const metaBlock = goalPct != null && (
    <div>
      <div className="flex justify-between text-[11px] text-fg-muted">
        <span>{displayGoalCents != null ? `Meta ${formatMoney(displayGoalCents, { currency: displayCurrency })}` : 'Meta'}</span>
        <span className="font-semibold text-fg">{goalPct}%</span>
      </div>
      <MiniProgress pct={goalPct} tone="accent" size="bar" className="mt-1.5" />
      {faltaDisplayCents != null && (
        <p className="tnum mt-1.5 text-[11px] text-fg-muted">faltan {formatMoney(faltaDisplayCents, { currency: displayCurrency })}</p>
      )}
    </div>
  )

  return (
    <li className="border-t border-divider first:border-t-0">
      {/* Escritorio: nombre/chips a la izquierda, meta (180px), valor (120px) y las acciones explícitas. */}
      <div className="hidden items-center gap-[18px] px-6 py-3.5 transition-colors duration-150 hover:bg-fill-subtle lg:flex">
        <button type="button" onClick={() => onOpenDetail(bucket)} className="flex min-w-0 flex-1 flex-col items-start gap-1.5 text-left">
          <span className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-fg">{bucket.name}</span>
            {!bucket.include_in_total && <Badge variant="outline">No cuenta en el total</Badge>}
          </span>
          {chips.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {visibleChips.map((c) => (
                <span key={c} className="tnum rounded-[4px] bg-fill-subtle px-[9px] py-[3px] text-[11px] font-medium text-fg-secondary">
                  {c}
                </span>
              ))}
              {restChipCount > 0 && (
                <span className="rounded-[4px] border border-dashed border-border-strong px-[9px] py-[3px] text-[11px] font-semibold text-accent">
                  +{restChipCount} activo{restChipCount === 1 ? '' : 's'}
                </span>
              )}
            </span>
          )}
        </button>
        <div className="w-[180px] shrink-0">{metaBlock}</div>
        {displayValueCents == null ? (
          <p className="min-w-[120px] shrink-0 text-right text-[13px] text-fg-muted">Sin cotización</p>
        ) : (
          // `min-w`, no `w`: mismo motivo que en `AssetLegendRow` — con el toggle ARS/USD un valor
          // en USD puede ser más ancho que la columna de ARS, y `w` fijo + `justify-end` desborda
          // el monto hacia la izquierda, superponiéndolo con la meta.
          <Money
            cents={displayValueCents}
            currency={displayCurrency}
            tone="fg"
            size="figure"
            hidden={hidden}
            className="min-w-[120px] shrink-0 justify-end"
          />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenDetail(bucket)}>
            Historial
          </Button>
          <IconSquare onClick={() => onQuickEntry(bucket)} aria-label={`${bucket.name}: nuevo aporte`}>
            <Plus className="size-3" strokeWidth={1.8} aria-hidden />
          </IconSquare>
          <EyeToggle hidden={hidden} onToggle={toggleItemHidden} label={bucket.name} disabled={globalHidden} />
          <button
            type="button"
            onClick={() => onEdit(bucket)}
            aria-label={`Editar ${bucket.name}`}
            className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
          >
            <Pencil className="size-3.5" strokeWidth={1.3} aria-hidden />
          </button>
        </div>
      </div>

      {/* Mobile: sin botones de acción — tocar la fila abre el historial, que ya tiene "Nuevo aporte". */}
      {/* `items-stretch` no es redundante acá: a diferencia de un `div`, el UA stylesheet de un
          `<button>` trae `align-items: flex-start` por default incluso con `display:flex` — sin
          esto `metaBlock` (un `<div>` sin ancho propio) se achica al contenido en vez de ocupar
          todo el ancho del botón, y "Meta $X" y el "%" quedan pegados sin espacio entre sí. */}
      <button
        type="button"
        onClick={() => onOpenDetail(bucket)}
        className="flex w-full flex-col items-stretch gap-2 px-5 py-3 text-left transition-colors duration-150 hover:bg-fill-subtle lg:hidden"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold text-fg">{bucket.name}</span>
              {!bucket.include_in_total && <Badge variant="outline">Afuera</Badge>}
            </span>
            {chips.length > 0 && <span className="tnum mt-0.5 block truncate text-[11px] text-fg-muted">{chips.join(' · ')}</span>}
          </span>
          {displayValueCents == null ? (
            <span className="shrink-0 text-[13px] text-fg-muted">Sin cotización</span>
          ) : (
            <Money cents={displayValueCents} currency={displayCurrency} tone="fg" size="figure" hidden={hidden} className="shrink-0 !text-[16px]" />
          )}
        </span>
        {metaBlock}
      </button>
    </li>
  )
}

export function Ahorros() {
  const { data: buckets, isPending: isBucketsPending, isError, refetch } = useSavingsBuckets()
  const { data: entries, isPending: isEntriesPending } = useSavingsEntries()
  const { data: assets, isPending: isAssetsPending } = useAssets()
  const prices = useAssetPrices()
  const chartColors = useChartColors()

  // Buckets, entries y assets son tres queries independientes — hay que esperar a las tres antes de
  // agregar, si no `summarizePortfolio` puede correr con aportes ya cargados pero activos todavía no
  // (pasa justo después de un reload duro, como al cambiar de vista con un plugin de responsive).
  const isPending = isBucketsPending || isEntriesPending || isAssetsPending

  const [bucketFormOpen, setBucketFormOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<SavingsBucket | null>(null)
  const [detailBucket, setDetailBucket] = useState<SavingsBucket | null>(null)
  const [quickEntryBucket, setQuickEntryBucket] = useState<SavingsBucket | null>(null)
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('ARS')
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('ahorros-total')
  const [compositionOtrosExpanded, setCompositionOtrosExpanded] = useState(false)
  const [compositionModalOpen, setCompositionModalOpen] = useState(false)

  const portfolio = summarizePortfolio(buckets ?? [], entries ?? [], assets ?? [], prices)

  const usdAssetId = (assets ?? []).find((a) => a.symbol === 'USD')?.id
  const usdPrice = usdAssetId ? (prices.get(usdAssetId) ?? null) : null
  const usdRateCents = usdPrice?.priceArsCents ?? null

  const displayCents = toDisplayCents(portfolio.totalValueCents, displayCurrency, usdRateCents)
  const costDisplayCents = toDisplayCents(portfolio.totalGain.costArsCents, displayCurrency, usdRateCents)
  const gainDisplayCents = toDisplayCents(portfolio.totalGain.gainCents, displayCurrency, usdRateCents)
  // "En dólares" es siempre la equivalencia — si ya estás mirando el total en USD, mostrarla nuevamente
  // sería redundante (ver el toggle ARS/USD, que no existe en el mock: es lo único que ya traía la app).
  const usdTotalCents = displayCurrency === 'ARS' ? toDisplayCents(portfolio.totalValueCents, 'USD', usdRateCents) : null

  let aportadoPct = 0
  let gananciaPct = 0
  if (portfolio.totalValueCents != null && portfolio.totalValueCents > 0 && portfolio.totalGain.costArsCents != null) {
    aportadoPct = Math.max(0, Math.min(100, (portfolio.totalGain.costArsCents / portfolio.totalValueCents) * 100))
    gananciaPct = Math.max(0, 100 - aportadoPct)
  }

  const includedBuckets = (buckets ?? []).filter((b) => b.include_in_total)
  const excludedBuckets = (buckets ?? []).filter((b) => !b.include_in_total)
  const itemsLabel = `${includedBuckets.length} ítem${includedBuckets.length === 1 ? '' : 's'} suma${includedBuckets.length === 1 ? '' : 'n'} al total`
  const excludedLabel =
    excludedBuckets.length > 0
      ? `${excludedBuckets.map((b) => b.name).join(', ')} queda${excludedBuckets.length === 1 ? '' : 'n'} afuera`
      : null

  const allHeldAssetIds = new Set<string>()
  portfolio.perBucket.forEach((s) => s.nets.forEach((n) => n.quantityUnits !== 0 && allHeldAssetIds.add(n.assetId)))

  const slices = assetSlices(portfolio.totalNets, assets ?? [], prices)
  const totalSliceCents = slices?.reduce((sum, s) => sum + s.cents, 0) ?? 0
  const { top: topSlices, rest: restSlices, restCents } = splitTopN(slices ?? [], ASSETS_TOP_N)
  const donutData =
    restSlices.length > 0
      ? [
          ...topSlices,
          {
            assetId: OTROS_ASSET_ID,
            name: `Otros ${restSlices.length} activo${restSlices.length === 1 ? '' : 's'}`,
            color: chartColors.fgMuted,
            cents: restCents,
            pct: totalSliceCents > 0 ? (restCents / totalSliceCents) * 100 : 0,
          },
        ]
      : topSlices

  function openNewBucket() {
    setEditingBucket(null)
    setBucketFormOpen(true)
  }

  function openEditBucket(bucket: SavingsBucket) {
    setEditingBucket(bucket)
    setBucketFormOpen(true)
  }

  const usdLabel = usdUpdatedLabel(usdPrice?.updatedAt ?? null)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ahorros</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Lo que tenés guardado</h1>
          <p className="mt-2 max-w-md text-[13px] text-fg-muted">Aparte del saldo del mes: no afecta a Hoy ni a Análisis.</p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedToggle value={displayCurrency} onChange={setDisplayCurrency} options={CURRENCY_OPTIONS} />
          <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="ahorros" />
          <Button size="compact" onClick={openNewBucket} icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}>
            Nuevo ítem
          </Button>
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-4">
          <Panel className="p-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-11 w-56" />
          </Panel>
          <Panel className="p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-14 w-full" />
          </Panel>
          <Panel className="p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-3 w-full rounded-pill" />
          </Panel>
        </div>
      ) : (buckets ?? []).length === 0 ? (
        <EmptyState
          glyph="◈"
          title="Todavía no tenés ítems de Ahorros"
          hint="Fondo de emergencia, ahorros, jubilación… lo que tenés guardado y no se toca."
          action={<Button onClick={openNewBucket}>Nuevo ítem</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Total guardado — el hero contesta una sola pregunta. Invertido, ganancia y el
              equivalente en dólares suben como cifras secundarias en el mismo bloque, con la barra
              de aportado vs. ganancia — no un panel aparte. */}
          <Panel className="p-6 lg:p-7">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-11">
              <div className="shrink-0">
                <p className="eyebrow">Total guardado</p>
                {displayCents == null ? (
                  <p className="mt-2 text-[15px] text-fg-secondary">Cotización no disponible</p>
                ) : (
                  <Money cents={displayCents} currency={displayCurrency} tone="fg" size="hero" className="mt-1" hidden={balanceHidden} />
                )}
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-muted">
                  <span>{itemsLabel}</span>
                  {excludedLabel && (
                    <>
                      <span aria-hidden className="h-[11px] w-px bg-divider" />
                      <span>{excludedLabel}</span>
                    </>
                  )}
                </p>
              </div>

              {portfolio.totalValueCents != null && portfolio.totalValueCents > 0 && (
                <div className="min-w-0 flex-1 border-t border-divider pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
                  {portfolio.totalGain.costArsCents == null ? (
                    <p className="text-[13px] text-fg-muted">
                      {portfolio.totalGain.missingRateCount > 0
                        ? `Faltan cotizaciones de compra en ${portfolio.totalGain.missingRateCount} aporte${portfolio.totalGain.missingRateCount === 1 ? '' : 's'}.`
                        : 'La ganancia estimada no está disponible sin cotización de algún activo en tenencia.'}
                    </p>
                  ) : (
                    <>
                      <StackedBar segments={[{ pct: aportadoPct, color: chartColors.fgMuted }, { pct: gananciaPct, color: chartColors.accent }]} className="h-2.5" />
                      {costDisplayCents != null && (
                        <p className="mt-2.5 text-[11.5px] text-fg-muted">
                          De ese total, {formatMoney(costDisplayCents, { currency: displayCurrency })} los pusiste vos
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-8">
                        {costDisplayCents != null && <SecondaryFigure label="Total invertido" cents={costDisplayCents} currency={displayCurrency} tone="dim" />}
                        {gainDisplayCents != null && (
                          <SecondaryFigure
                            label="Ganancia estimada"
                            cents={gainDisplayCents}
                            currency={displayCurrency}
                            tone={gainDisplayCents < 0 ? 'negative' : 'accent'}
                            signed
                          />
                        )}
                        {usdTotalCents != null && usdRateCents != null && (
                          <SecondaryFigure label="En dólares" cents={usdTotalCents} currency="USD" hint={`1 USD = ${formatMoney(usdRateCents)}`} />
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Panel>

          {/* Tus ítems — lista de filas, no tarjetas (ver `ItemRow`). */}
          <Panel>
            <CardHeader
              title="Tus ítems"
              action={
                <span className="text-[11.5px] text-fg-muted">
                  {portfolio.perBucket.length} ítem{portfolio.perBucket.length === 1 ? '' : 's'} · {allHeldAssetIds.size} activo
                  {allHeldAssetIds.size === 1 ? '' : 's'}
                </span>
              }
            />
            <ul className="pb-2">
              {portfolio.perBucket.map((summary) => (
                <ItemRow
                  key={summary.bucket.id}
                  summary={summary}
                  assets={assets ?? []}
                  displayCurrency={displayCurrency}
                  usdRateCents={usdRateCents}
                  globalHidden={balanceHidden}
                  onEdit={openEditBucket}
                  onOpenDetail={setDetailBucket}
                  onQuickEntry={setQuickEntryBucket}
                />
              ))}
            </ul>
          </Panel>

          {/* Composición — donut cortado en 5 filas (top 4 + "Otros"), el detalle completo se abre
              en un modal aparte en vez de crecer sin límite (ver DECISIONES.md, tanda 15a). */}
          <Panel className="p-6">
            {slices == null ? (
              <p className="text-[13px] text-fg-muted">Cotización no disponible para calcular la composición.</p>
            ) : slices.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Sin aportes todavía.</p>
            ) : (
              <>
                {/* Escritorio: donut + leyenda + rail con el enlace al detalle completo. */}
                <div className="hidden items-center gap-8 lg:flex">
                  <CategoryDonut
                    data={donutData.map((s) => ({ categoryId: s.assetId, categoryName: s.name, color: s.color, cents: s.cents }))}
                    centerOverride={{ eyebrow: slices[0].name, value: `${Math.round(slices[0].pct)}%` }}
                    size={152}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-[14.5px] font-semibold text-fg">Composición</span>
                      <span className="text-[11.5px] text-fg-muted">
                        {slices.length} activo{slices.length === 1 ? '' : 's'} · {donutData.length} en pantalla
                      </span>
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-x-8">
                      {topSlices.map((s) => (
                        <AssetLegendRow key={s.assetId} name={s.name} color={s.color} cents={s.cents} pct={s.pct} currency={displayCurrency} />
                      ))}
                      {restSlices.length > 0 && (
                        <li className="col-span-2">
                          <button
                            type="button"
                            onClick={() => setCompositionOtrosExpanded((v) => !v)}
                            aria-expanded={compositionOtrosExpanded}
                            className="flex w-full items-center gap-3 rounded-chip py-2 text-left transition-opacity hover:opacity-70"
                          >
                            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors.fgMuted }} />
                            <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg-muted">
                              Otros {restSlices.length} activo{restSlices.length === 1 ? '' : 's'}
                            </span>
                            <span className="tnum w-9 shrink-0 text-right text-[12px] text-fg-muted">
                              {totalSliceCents > 0 ? Math.round((restCents / totalSliceCents) * 100) : 0}%
                            </span>
                            <span className="flex min-w-24 shrink-0 items-center justify-end gap-1.5">
                              <Money cents={restCents} currency={displayCurrency} tone="dim" size="row" />
                              <ChevronRight
                                className={cn('size-3 shrink-0 text-fg-muted transition-transform duration-150', compositionOtrosExpanded && 'rotate-90')}
                                strokeWidth={1.8}
                                aria-hidden
                              />
                            </span>
                          </button>
                          {compositionOtrosExpanded && (
                            <ul>
                              {restSlices.map((s) => (
                                <AssetLegendRow key={s.assetId} name={s.name} color={s.color} cents={s.cents} pct={s.pct} currency={displayCurrency} dim />
                              ))}
                            </ul>
                          )}
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="flex w-[200px] shrink-0 flex-col gap-2.5 self-stretch border-l border-divider pl-6">
                    <button type="button" onClick={() => setCompositionModalOpen(true)} className="text-left text-[12.5px] font-semibold text-accent hover:opacity-70">
                      Ver los {slices.length} activos
                    </button>
                    <p className="text-[11.5px] leading-normal text-fg-muted">
                      El detalle completo se abre en un modal.{usdLabel ? ` ${usdLabel}` : ''}
                    </p>
                  </div>
                </div>

                {/* Mobile: donut chico + top 3, sin agrupar "Otros" (mismo criterio que el mock). */}
                <div className="flex flex-col gap-3 lg:hidden">
                  <div className="flex items-center gap-4">
                    <CategoryDonut
                      data={donutData.map((s) => ({ categoryId: s.assetId, categoryName: s.name, color: s.color, cents: s.cents }))}
                      centerOverride={{ eyebrow: '', value: `${Math.round(slices[0].pct)}%` }}
                      size={88}
                    />
                    <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {slices.slice(0, 3).map((s) => (
                        <li key={s.assetId} className="flex items-center gap-2">
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg">{s.name}</span>
                          <span className="tnum text-[12px] text-fg-muted">{Math.round(s.pct)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompositionModalOpen(true)}
                    className="border-t border-divider pt-3 text-left text-[11.5px] font-semibold text-accent"
                  >
                    Ver los {slices.length} activos
                  </button>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {compositionModalOpen && (
        <Dialog
          open={compositionModalOpen}
          onClose={() => setCompositionModalOpen(false)}
          title="Composición completa"
          footer={
            <Button variant="ghost" onClick={() => setCompositionModalOpen(false)}>
              Cerrar
            </Button>
          }
        >
          <CompositionView nets={portfolio.totalNets} assets={assets ?? []} prices={prices} />
        </Dialog>
      )}

      {bucketFormOpen && <BucketFormDialog open={bucketFormOpen} onClose={() => setBucketFormOpen(false)} bucket={editingBucket} />}
      {detailBucket && (
        <BucketDetailDialog
          open={!!detailBucket}
          onClose={() => setDetailBucket(null)}
          bucket={detailBucket}
          entries={(entries ?? []).filter((e) => e.bucket_id === detailBucket.id)}
          assets={assets ?? []}
        />
      )}
      {quickEntryBucket && (
        <SavingsEntryFormDialog open={!!quickEntryBucket} onClose={() => setQuickEntryBucket(null)} bucket={quickEntryBucket} />
      )}
    </div>
  )
}
