import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatQuantity, unitsFromNumeric } from '@/lib/money'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'
import { CompositionView } from '@/features/savings/CompositionView'
import { netByAsset } from '@/features/savings/aggregate'
import { useAssetPrices } from '@/features/fx/api'
import type { Asset } from '@/features/assets/api'
import type { SavingsBucket, SavingsEntry } from '@/features/savings/api'

interface BucketDetailDialogProps {
  open: boolean
  onClose: () => void
  bucket: SavingsBucket
  entries: SavingsEntry[]
  assets: Asset[]
}

/** Historial de aportes de un ítem, con alta y edición on-demand del aporte tocado. */
export function BucketDetailDialog({ open, onClose, bucket, entries, assets }: BucketDetailDialogProps) {
  const [entryFormOpen, setEntryFormOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsEntry | null>(null)
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const prices = useAssetPrices()
  const nets = useMemo(() => netByAsset(entries, assets), [entries, assets])
  // Con un solo activo en tenencia la composición es trivialmente "100%" — no aporta nada, así que
  // sólo se muestra cuando el ítem de verdad mezcla monedas/activos.
  const heldAssetCount = nets.filter((n) => n.quantityUnits !== 0).length

  function openNewEntry() {
    setEditing(null)
    setEntryFormOpen(true)
  }

  function openEditEntry(entry: SavingsEntry) {
    setEditing(entry)
    setEntryFormOpen(true)
  }

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir el aporte encima, porque `open` de este Dialog baja a
  // false). Sin este filtro, abrir un aporte para editar cerraba TODO el historial de un tirón.
  function handleHistoryClose() {
    if (!entryFormOpen) onClose()
  }

  return (
    <>
      <Dialog
        open={open && !entryFormOpen}
        onClose={handleHistoryClose}
        title={bucket.name}
        footer={
          <>
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cerrar
            </Button>
            <Button size="dialogFooter" onClick={openNewEntry}>
              Nuevo aporte
            </Button>
          </>
        }
      >
        {entries.length === 0 ? (
          <EmptyState glyph="◈" title="Todavía no cargaste aportes" hint="El primero puede ser el saldo que ya tenés ahorrado." />
        ) : (
          <>
            {heldAssetCount > 1 && (
              <div className="mb-5 border-b border-fill-subtle pb-5">
                <p className="eyebrow mb-3">Composición</p>
                <CompositionView nets={nets} assets={assets} prices={prices} />
              </div>
            )}
            <ul className="-mx-panel flex max-h-[50vh] flex-col overflow-y-auto">
            {entries.map((entry) => {
              const asset = assetById.get(entry.asset_id)
              if (!asset) return null
              const isWithdrawal = entry.kind === 'withdrawal'
              // Sólo un depósito en un activo distinto de ARS necesita cotización de compra — sin
              // ella no entra en la ganancia estimada. Se marca acá porque si no, hay que abrir cada
              // aporte para saberlo.
              const missingRate = !isWithdrawal && asset.symbol !== 'ARS' && entry.rate_to_main == null
              const units = unitsFromNumeric(entry.amount, asset.decimals)

              return (
                <li key={entry.id} className="border-t border-fill-subtle first:border-t-0">
                  <button
                    type="button"
                    onClick={() => openEditEntry(entry)}
                    className="flex w-full items-center gap-3 px-panel py-3 text-left transition-colors duration-150 hover:bg-fill-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-fg">
                        {isWithdrawal ? 'Retiro' : 'Aporte'} en {asset.symbol}
                        {missingRate && (
                          <Badge variant="amber" className="ml-2">
                            Sin cotización
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12px] text-fg-muted">
                        {format(parseISO(entry.occurred_on), "d 'de' MMMM yyyy", { locale: es })}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    {asset.symbol === 'ARS' ? (
                      <Money cents={isWithdrawal ? -units : units} tone={isWithdrawal ? 'negative' : 'fg'} signed />
                    ) : (
                      <span className={cn('tnum text-[14px]', isWithdrawal ? 'text-negative' : 'text-fg')}>
                        {isWithdrawal ? '−' : '+'}
                        {formatQuantity(units, asset.decimals)} {asset.symbol}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
            </ul>
          </>
        )}
      </Dialog>

      {entryFormOpen && (
        <SavingsEntryFormDialog
          open={entryFormOpen}
          onClose={() => setEntryFormOpen(false)}
          bucket={bucket}
          entry={editing}
        />
      )}
    </>
  )
}
