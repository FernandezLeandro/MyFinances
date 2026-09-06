import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { format, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { type Currency } from '@/lib/money'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useSavingsBuckets, useSavingsEntries, type SavingsBucket } from '@/features/savings/api'
import { summarizePortfolio, type BucketSummary } from '@/features/savings/aggregate'
import { CompositionView } from '@/features/savings/CompositionView'
import { NetAmount } from '@/features/savings/NetAmount'
import { useAssets, type Asset } from '@/features/assets/api'
import { useAssetPrices } from '@/features/fx/api'
import { BucketFormDialog } from '@/features/savings/BucketFormDialog'
import { BucketDetailDialog } from '@/features/savings/BucketDetailDialog'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'

const CURRENCY_OPTIONS = [
  { value: 'ARS' as const, label: 'ARS' },
  { value: 'USD' as const, label: 'USD' },
]

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

function BucketCard({
  summary,
  assets,
  globalHidden,
  onEdit,
  onOpenDetail,
  onQuickEntry,
}: {
  summary: BucketSummary
  assets: Asset[]
  globalHidden: boolean
  onEdit: (b: SavingsBucket) => void
  onOpenDetail: (b: SavingsBucket) => void
  onQuickEntry: (b: SavingsBucket) => void
}) {
  const { bucket, nets, valueCents } = summary
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const heldNets = nets.filter((n) => n.quantityUnits !== 0)
  const [itemHidden, toggleItemHidden] = useHiddenBalance(`ahorros-item-${bucket.id}`)
  const hidden = globalHidden || itemHidden

  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-[13.5px] text-fg-secondary">{bucket.name}</p>
            {!bucket.include_in_total && <Badge variant="outline">No cuenta en el total</Badge>}
          </div>
          {valueCents == null ? (
            <p className="mt-1.5 text-[13px] text-fg-muted">Cotización no disponible</p>
          ) : (
            <Money cents={valueCents} tone="fg" size="figure" className="mt-1.5" hidden={hidden} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EyeToggle hidden={hidden} onToggle={toggleItemHidden} label={bucket.name} disabled={globalHidden} />
          <button
            type="button"
            onClick={() => onEdit(bucket)}
            aria-label={`Editar ${bucket.name}`}
            className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
          >
            <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
          </button>
        </div>
      </div>

      {heldNets.length > 0 && (
        <dl className="mt-4 space-y-1.5 border-t border-divider pt-3 text-[12.5px]">
          {heldNets.map((net) => {
            const asset = assetById.get(net.assetId)
            if (!asset) return null
            return (
              <div key={net.assetId} className="flex justify-between gap-4">
                <dt className="text-fg-muted">{asset.symbol}</dt>
                <dd>
                  <NetAmount net={net} asset={asset} hidden={hidden} />
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="outline" size="sm" onClick={() => onOpenDetail(bucket)} className="flex-1">
          Historial
        </Button>
        <Button size="sm" onClick={() => onQuickEntry(bucket)} className="flex-1">
          Nuevo aporte
        </Button>
      </div>
    </Panel>
  )
}

export function Ahorros() {
  const { data: buckets, isPending: isBucketsPending, isError, refetch } = useSavingsBuckets()
  const { data: entries, isPending: isEntriesPending } = useSavingsEntries()
  const { data: assets, isPending: isAssetsPending } = useAssets()
  const prices = useAssetPrices()

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

  const portfolio = useMemo(
    () => summarizePortfolio(buckets ?? [], entries ?? [], assets ?? [], prices),
    [buckets, entries, assets, prices],
  )

  const usdAssetId = (assets ?? []).find((a) => a.symbol === 'USD')?.id
  const usdPrice = usdAssetId ? (prices.get(usdAssetId) ?? null) : null
  const usdRateCents = usdPrice?.priceArsCents ?? null

  function openNewBucket() {
    setEditingBucket(null)
    setBucketFormOpen(true)
  }

  function openEditBucket(bucket: SavingsBucket) {
    setEditingBucket(bucket)
    setBucketFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Ahorros</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Lo que tenés guardado</h1>
          <p className="mt-2 max-w-md text-[13px] text-fg-muted">
            Fondo de emergencia, ahorros y jubilación — aparte del saldo del mes, no afecta a Hoy ni a Análisis.
          </p>
        </div>
        <Button onClick={openNewBucket} icon={<span className="text-base leading-none">+</span>}>
          Nuevo ítem
        </Button>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="p-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-4 h-11 w-56" />
            </Panel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Panel key={i} className="p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-7 w-32" />
                  <Skeleton className="mt-4 h-8 w-full" />
                </Panel>
              ))}
            </div>
          </div>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Total de Ahorros</p>
                  <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="ahorros" />
                </div>
                <SegmentedToggle value={displayCurrency} onChange={setDisplayCurrency} options={CURRENCY_OPTIONS} />
              </div>
              {(() => {
                const displayCents = toDisplayCents(portfolio.totalValueCents, displayCurrency, usdRateCents)
                return displayCents == null ? (
                  <p className="mt-2 text-[15px] text-fg-secondary">Cotización no disponible</p>
                ) : (
                  <Money
                    cents={displayCents}
                    currency={displayCurrency}
                    tone="fg"
                    size="total"
                    className="mt-2.5"
                    hidden={balanceHidden}
                  />
                )
              })()}
            </Panel>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {portfolio.perBucket.map((summary) => (
                <BucketCard
                  key={summary.bucket.id}
                  summary={summary}
                  assets={assets ?? []}
                  globalHidden={balanceHidden}
                  onEdit={openEditBucket}
                  onOpenDetail={setDetailBucket}
                  onQuickEntry={setQuickEntryBucket}
                />
              ))}
            </div>
          </div>

          <Panel className="flex flex-col">
            <CardHeader title="Composición" />
            <div className="flex flex-1 flex-col px-6 pb-6">
              <CompositionView nets={portfolio.totalNets} assets={assets ?? []} prices={prices} />

              <div className="mt-5 border-t border-divider pt-4">
                <p className="eyebrow">Total invertido</p>
                {(() => {
                  const displayCents = toDisplayCents(portfolio.totalGain.costArsCents, displayCurrency, usdRateCents)
                  if (displayCents == null) {
                    return (
                      <p className="mt-2 text-[13px] text-fg-muted">
                        {portfolio.totalGain.missingRateCount > 0
                          ? `Faltan cotizaciones de compra en ${portfolio.totalGain.missingRateCount} aporte${portfolio.totalGain.missingRateCount === 1 ? '' : 's'}.`
                          : 'No disponible sin cotización de algún activo en tenencia.'}
                      </p>
                    )
                  }
                  return <Money cents={displayCents} currency={displayCurrency} tone="dim" size="figure" className="mt-2" />
                })()}
              </div>

              <div className="mt-5 border-t border-divider pt-4">
                <p className="eyebrow">Ganancia estimada</p>
                {(() => {
                  const displayCents = toDisplayCents(portfolio.totalGain.gainCents, displayCurrency, usdRateCents)
                  if (displayCents == null) {
                    return (
                      <p className="mt-2 text-[13px] text-fg-muted">
                        {portfolio.totalGain.missingRateCount > 0
                          ? `Faltan cotizaciones de compra en ${portfolio.totalGain.missingRateCount} aporte${portfolio.totalGain.missingRateCount === 1 ? '' : 's'}.`
                          : 'No disponible sin cotización de algún activo en tenencia.'}
                      </p>
                    )
                  }
                  return (
                    <Money
                      cents={displayCents}
                      currency={displayCurrency}
                      tone={displayCents < 0 ? 'negative' : 'accent'}
                      size="figure"
                      signed
                      className="mt-2"
                    />
                  )
                })()}
              </div>

              {(() => {
                const label = usdUpdatedLabel(usdPrice?.updatedAt ?? null)
                return label && <p className="mt-auto pt-5 text-[11.5px] text-fg-muted">{label}</p>
              })()}
            </div>
          </Panel>
        </div>
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
