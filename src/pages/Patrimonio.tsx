import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSavingsBuckets, useSavingsEntries, type SavingsBucket } from '@/features/savings/api'
import { summarizePortfolio, type BucketSummary } from '@/features/savings/aggregate'
import { useUsdRate } from '@/features/fx/api'
import { BucketFormDialog } from '@/features/savings/BucketFormDialog'
import { BucketDetailDialog } from '@/features/savings/BucketDetailDialog'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'

function fxLabel(rate: ReturnType<typeof useUsdRate>) {
  if (rate.rateCents == null) return 'Sin cotización del dólar cargada — cargá una en Ajustes'
  const money = <Money cents={rate.rateCents} tone="dim" />
  const when = rate.updatedAt
    ? `actualizado ${formatDistanceToNow(new Date(rate.updatedAt), { locale: es, addSuffix: true })}`
    : null
  const originLabel = rate.origin === 'manual' ? (rate.isFallback ? 'valor manual, la API falló' : 'valor manual') : 'dolarapi.com'
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      Dólar: {money} <span className="text-chalk-faint">· {originLabel}{when ? ` · ${when}` : ''}</span>
    </span>
  )
}

function BucketCard({
  summary,
  onEdit,
  onOpenDetail,
  onQuickEntry,
}: {
  summary: BucketSummary
  onEdit: (b: SavingsBucket) => void
  onOpenDetail: (b: SavingsBucket) => void
  onQuickEntry: (b: SavingsBucket) => void
}) {
  const { bucket, net, valueCents } = summary

  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-chalk-dim">{bucket.name}</p>
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

      {(net.arsCents !== 0 || net.usdCents !== 0) && (
        <dl className="mt-4 space-y-1.5 border-t border-ink-800 pt-3 text-[13px]">
          {net.arsCents !== 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">ARS</dt>
              <dd>
                <Money cents={net.arsCents} tone="dim" />
              </dd>
            </div>
          )}
          {net.usdCents !== 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">USD</dt>
              <dd>
                <Money cents={net.usdCents} currency="USD" tone="dim" />
              </dd>
            </div>
          )}
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
  const { data: buckets, isPending, isError, refetch } = useSavingsBuckets()
  const { data: entries } = useSavingsEntries()
  const usdRate = useUsdRate()

  const [bucketFormOpen, setBucketFormOpen] = useState(false)
  const [editingBucket, setEditingBucket] = useState<SavingsBucket | null>(null)
  const [detailBucket, setDetailBucket] = useState<SavingsBucket | null>(null)
  const [quickEntryBucket, setQuickEntryBucket] = useState<SavingsBucket | null>(null)

  const portfolio = useMemo(
    () => summarizePortfolio(buckets ?? [], entries ?? [], usdRate.rateCents),
    [buckets, entries, usdRate.rateCents],
  )

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
              <p className="eyebrow">Total de Patrimonio</p>
              {portfolio.totalValueCents == null ? (
                <p className="mt-2 text-[15px] text-chalk-dim">Cotización no disponible</p>
              ) : (
                <Money cents={portfolio.totalValueCents} tone="acid" size="hero" className="mt-2" />
              )}
              <p className="mt-4 text-[13px] text-chalk-faint">{fxLabel(usdRate)}</p>
            </Panel>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {portfolio.perBucket.map((summary) => (
                <BucketCard
                  key={summary.bucket.id}
                  summary={summary}
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
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">En ARS</dt>
                <dd>
                  <Money cents={portfolio.totalNet.arsCents} tone="dim" />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">En USD</dt>
                <dd>
                  <Money cents={portfolio.totalNet.usdCents} currency="USD" tone="dim" />
                </dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-ink-800 pt-4">
              <p className="eyebrow">Ganancia estimada</p>
              {portfolio.totalGain.gainCents == null ? (
                <p className="mt-2 text-[13px] text-chalk-faint">
                  {portfolio.totalGain.missingRateCount > 0
                    ? `Faltan cotizaciones de compra en ${portfolio.totalGain.missingRateCount} aporte${portfolio.totalGain.missingRateCount === 1 ? '' : 's'} en USD.`
                    : 'No disponible sin cotización del dólar.'}
                </p>
              ) : (
                <Money
                  cents={portfolio.totalGain.gainCents}
                  tone={portfolio.totalGain.gainCents < 0 ? 'coral' : 'chalk'}
                  size="figure"
                  signed
                  className="mt-2"
                />
              )}
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
        />
      )}
      {quickEntryBucket && (
        <SavingsEntryFormDialog open={!!quickEntryBucket} onClose={() => setQuickEntryBucket(null)} bucket={quickEntryBucket} />
      )}
    </div>
  )
}
