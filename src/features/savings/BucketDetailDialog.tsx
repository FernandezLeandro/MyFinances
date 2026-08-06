import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatQuantity, unitsFromNumeric } from '@/lib/money'
import { SavingsEntryFormDialog } from '@/features/savings/SavingsEntryFormDialog'
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
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button onClick={openNewEntry}>Nuevo aporte</Button>
          </>
        }
      >
        {entries.length === 0 ? (
          <EmptyState glyph="◈" title="Todavía no cargaste aportes" hint="El primero puede ser el saldo que ya tenés ahorrado." />
        ) : (
          <ul className="-mx-6 flex max-h-[50vh] flex-col overflow-y-auto">
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
                <li key={entry.id} className="border-t border-ink-850 first:border-t-0">
                  <button
                    type="button"
                    onClick={() => openEditEntry(entry)}
                    className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors duration-150 hover:bg-ink-850"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-chalk">
                        {isWithdrawal ? 'Retiro' : 'Aporte'} en {asset.symbol}
                        {missingRate && <span className="ml-2 text-[11px] font-medium text-amber">Sin cotización</span>}
                      </p>
                      <p className="mt-0.5 text-[12px] text-chalk-faint">
                        {format(parseISO(entry.occurred_on), "d 'de' MMMM yyyy", { locale: es })}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </p>
                    </div>
                    {asset.symbol === 'ARS' ? (
                      <Money cents={isWithdrawal ? -units : units} tone={isWithdrawal ? 'coral' : 'chalk'} signed />
                    ) : (
                      <span className={cn('tnum text-[14px]', isWithdrawal ? 'text-coral' : 'text-chalk')}>
                        {isWithdrawal ? '−' : '+'}
                        {formatQuantity(units, asset.decimals)} {asset.symbol}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
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
