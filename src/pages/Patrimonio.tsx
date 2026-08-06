import { useMemo, useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { formatQuantity, type Currency } from '@/lib/money'
import { useSavingsBuckets, useSavingsEntries, type SavingsBucket } from '@/features/savings/api'
import { summarizePortfolio, type AssetNet, type BucketSummary } from '@/features/savings/aggregate'
import { useAssets, type Asset } from '@/features/assets/api'
import { useAssetPrices, type AssetPrice } from '@/features/fx/api'
import { BucketFormDialog } from '@/features/savings/BucketFormDialog'
import { BucketDetailDialog } from '@/features/savings/BucketDetailDialog'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'

/** Todo el estado interno de Patrimonio vive en ARS — esto sólo convierte para MOSTRAR. */
function toDisplayCents(arsCents: number | null, currency: Currency, usdRateCents: number | null): number | null {
  if (arsCents == null) return null
  if (currency === 'ARS') return arsCents
  if (usdRateCents == null) return null
  return Math.round((arsCents * 100) / usdRateCents)
}

function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <div className="flex gap-1">
      <Chip active={value === 'ARS'} onClick={() => onChange('ARS')}>
        ARS
      </Chip>
      <Chip active={value === 'USD'} onClick={() => onChange('USD')}>
        USD
      </Chip>
    </div>
  )
}

function originLabel(price: AssetPrice | undefined) {
  if (!price) return null
  if (price.origin === 'fixed') return null
  if (price.origin === 'api') return 'en vivo'
  if (price.origin === 'manual') return 'manual'
  return null
}

/** Cantidad neta de un activo, tipografiada según corresponda: `Money` para ARS, cantidad + símbolo para el resto. */
function NetAmount({ net, asset, tone = 'dim' }: { net: AssetNet; asset: Asset; tone?: 'dim' | 'chalk' | 'coral' | 'acid' }) {
  if (asset.symbol === 'ARS') return <Money cents={net.quantityUnits} tone={tone} />
  return (
    <span className={cn('tnum text-[14px]', tone === 'dim' ? 'text-chalk-dim' : 'text-chalk')}>
      {formatQuantity(net.quantityUnits, asset.decimals)} {asset.symbol}
    </span>
  )
}

function PriceStatusLine({ nets, assets, prices }: { nets: AssetNet[]; assets: Asset[]; prices: Map<string, AssetPrice> }) {
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const held = nets.filter((n) => n.quantityUnits !== 0 && assetById.get(n.assetId)?.symbol !== 'ARS')

  if (held.length === 0) return null

  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
      {held.map((net) => {
        const asset = assetById.get(net.assetId)
        if (!asset) return null
        const price = prices.get(net.assetId)
        const label = originLabel(price)
        return (
          <span key={net.assetId} className="text-chalk-faint">
            {asset.symbol}:{' '}
            {price?.priceArsCents != null ? (
              <>
                <Money cents={price.priceArsCents} tone="dim" /> {label && <span>({label})</span>}
              </>
            ) : (
              <span className="text-amber">sin cotización</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

function BucketCard({
  summary,
  assets,
  onEdit,
  onOpenDetail,
  onQuickEntry,
}: {
  summary: BucketSummary
  assets: Asset[]
  onEdit: (b: SavingsBucket) => void
  onOpenDetail: (b: SavingsBucket) => void
  onQuickEntry: (b: SavingsBucket) => void
}) {
  const { bucket, nets, valueCents } = summary
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const heldNets = nets.filter((n) => n.quantityUnits !== 0)

  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-chalk-dim">
            {bucket.name}
            {!bucket.include_in_total && <span className="ml-2 text-[11px] font-medium text-chalk-faint">No cuenta en el total</span>}
          </p>
          {valueCents == null ? (
            <p className="mt-1.5 text-[13px] text-chalk-faint">Cotización no disponible</p>
          ) : (
            <Money cents={valueCents} tone="chalk" size="figure" className="mt-1" />
          )}
        </div>
        <button
          type="button"
          onClick={() => onEdit(bucket)}
          aria-label={`Editar ${bucket.name}`}
          className="shrink-0 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path
              d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {heldNets.length > 0 && (
        <dl className="mt-4 space-y-1.5 border-t border-ink-800 pt-3 text-[13px]">
          {heldNets.map((net) => {
            const asset = assetById.get(net.assetId)
            if (!asset) return null
            return (
              <div key={net.assetId} className="flex justify-between gap-4">
                <dt className="text-chalk-faint">{asset.symbol}</dt>
                <dd>
                  <NetAmount net={net} asset={asset} />
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      <div className="mt-4 flex gap-2">
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

export function Patrimonio() {
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

  const portfolio = useMemo(
    () => summarizePortfolio(buckets ?? [], entries ?? [], assets ?? [], prices),
    [buckets, entries, assets, prices],
  )

  const usdAssetId = (assets ?? []).find((a) => a.symbol === 'USD')?.id
  const usdRateCents = usdAssetId ? (prices.get(usdAssetId)?.priceArsCents ?? null) : null

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
          <p className="eyebrow">Patrimonio</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Lo que tenés guardado</h1>
          <p className="mt-2 max-w-md text-[13px] text-chalk-faint">
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Panel key={i} className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-9 w-36" />
              <Skeleton className="mt-4 h-8 w-full" />
            </Panel>
          ))}
        </div>
      ) : (buckets ?? []).length === 0 ? (
        <EmptyState
          glyph="◈"
          title="Todavía no tenés ítems de Patrimonio"
          hint="Fondo de emergencia, ahorros, jubilación… lo que tenés guardado y no se toca."
          action={<Button onClick={openNewBucket}>Nuevo ítem</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Panel className="p-6 ring-1 ring-acid/15">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="eyebrow">Total de Patrimonio</p>
                <CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />
              </div>
              {(() => {
                const displayCents = toDisplayCents(portfolio.totalValueCents, displayCurrency, usdRateCents)
                return displayCents == null ? (
                  <p className="mt-2 text-[15px] text-chalk-dim">Cotización no disponible</p>
                ) : (
                  <Money cents={displayCents} currency={displayCurrency} tone="acid" size="hero" className="mt-2" />
                )
              })()}
              <PriceStatusLine nets={portfolio.totalNets} assets={assets ?? []} prices={prices} />
            </Panel>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {portfolio.perBucket.map((summary) => (
                <BucketCard
                  key={summary.bucket.id}
                  summary={summary}
                  assets={assets ?? []}
                  onEdit={openEditBucket}
                  onOpenDetail={setDetailBucket}
                  onQuickEntry={setQuickEntryBucket}
                />
              ))}
            </div>
          </div>

          <Panel tone="flat" className="p-6">
            <PanelHeader title="Composición" />
            <dl className="space-y-2 text-[13px]">
              {portfolio.totalNets
                .filter((n) => n.quantityUnits !== 0)
                .map((net) => {
                  const asset = (assets ?? []).find((a) => a.id === net.assetId)
                  if (!asset) return null
                  return (
                    <div key={net.assetId} className="flex justify-between gap-4">
                      <dt className="text-chalk-faint">{asset.symbol}</dt>
                      <dd>
                        <NetAmount net={net} asset={asset} />
                      </dd>
                    </div>
                  )
                })}
            </dl>

            <div className="mt-5 border-t border-ink-800 pt-4">
              <p className="eyebrow">Total invertido</p>
              {(() => {
                const displayCents = toDisplayCents(portfolio.totalGain.costArsCents, displayCurrency, usdRateCents)
                if (displayCents == null) {
                  return (
                    <p className="mt-2 text-[13px] text-chalk-faint">
                      {portfolio.totalGain.missingRateCount > 0
                        ? `Faltan cotizaciones de compra en ${portfolio.totalGain.missingRateCount} aporte${portfolio.totalGain.missingRateCount === 1 ? '' : 's'}.`
                        : 'No disponible sin cotización de algún activo en tenencia.'}
                    </p>
                  )
                }
                return <Money cents={displayCents} currency={displayCurrency} tone="dim" size="figure" className="mt-2" />
              })()}
            </div>

            <div className="mt-5 border-t border-ink-800 pt-4">
              <p className="eyebrow">Ganancia estimada</p>
              {(() => {
                const displayCents = toDisplayCents(portfolio.totalGain.gainCents, displayCurrency, usdRateCents)
                if (displayCents == null) {
                  return (
                    <p className="mt-2 text-[13px] text-chalk-faint">
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
                    tone={displayCents < 0 ? 'coral' : 'chalk'}
                    size="figure"
                    signed
                    className="mt-2"
                  />
                )
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
