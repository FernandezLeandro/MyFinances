import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { StickyNote } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { accountNameOf, transferDeleteEffect } from '@/features/accounts/aggregate'
import { accountKindIcon } from '@/features/accounts/accountKind'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { useDeleteAccountTransfer, type AccountTransfer } from '@/features/accounts/transfers-api'

/** El detalle de una transferencia, con la única acción que admite: eliminarla (no se editan — se
 *  borra y se vuelve a crear). Es el mismo diálogo desde la fila de Movimientos y desde la X de
 *  «Últimas transferencias» en Cuentas: antes esa X borraba sin confirmar, y borrar no tiene tope,
 *  así que puede dejar el destino en negativo — acá se dice antes (`transferDeleteEffect`).
 *
 *  Falla adentro del diálogo, que no se cierra (patrón 5b); el éxito cierra y avisa con un toast.
 *
 *  Rediseño de modales v2, «recibo» (como `MovementDetailDialog`): ficha neutra de transferencia,
 *  importe centrado y una tarjeta con Sale de / Entra a — cada una con cómo queda si se elimina — y
 *  la nota. Eliminar va a la izquierda del pie, Cerrar a la derecha. */
export function TransferDetailDialog({ transfer, onClose }: { transfer: AccountTransfer; onClose: () => void }) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const deleteTransfer = useDeleteAccountTransfer()
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const byId = new Map((locations ?? []).map((l) => [l.id, l]))
  const nameOf = (id: string) => accountNameOf(byId, id)
  const effect = transferDeleteEffect({ transfer, balances, nameOf })
  const ends = [
    { label: 'Sale de', id: transfer.from_account_id, after: effect.fromAfterCents },
    { label: 'Entra a', id: transfer.to_account_id, after: effect.toAfterCents },
  ]

  async function remove() {
    setBusy(true)
    setSaveError(null)
    try {
      await deleteTransfer.mutateAsync(transfer.id)
      showToast('Transferencia eliminada', 'ok')
      onClose()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Transferencia"
      subtitle="Entre tus cuentas"
      icon={<CategoryChip neutral="transfer" size={40} />}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar
          start={
            <Button variant="ghost" size="dialogFooter" onClick={remove} loading={busy} className="text-negative! hover:text-negative!">
              {busy ? 'Eliminando…' : saveError ? 'Reintentar' : 'Eliminar'}
            </Button>
          }
        >
          <Button variant="outline" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 pt-1 pb-0.5">
          <Money cents={transfer.cents} size="figure" tone="fg" />
          <p className="text-[12.5px] text-fg-secondary">{format(parseISO(transfer.occurred_on), "EEEE d 'de' MMMM", { locale: es })}</p>
        </div>
        <dl className="flex flex-col rounded-panel-sm border border-border">
          {ends.map((end) => {
            const Icon = accountKindIcon(byId.get(end.id)?.kind ?? 'cash')
            return (
              <div key={end.label} className="flex items-center gap-3 border-b border-divider-list px-3.5 py-3 last:border-b-0">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-fill-subtle text-fg-secondary">
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <dt className="text-[12px] text-fg-secondary">{end.label}</dt>
                  <dd className="m-0 truncate text-[14.5px] font-semibold text-fg">{nameOf(end.id)}</dd>
                </div>
                {end.after != null && (
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[11.5px] text-fg-muted">si la eliminás</span>
                    <Money cents={end.after} tone={end.after < 0 ? 'negative' : 'fg'} />
                  </div>
                )}
              </div>
            )
          })}
          {transfer.description && (
            <div className="flex items-center gap-3 px-3.5 py-3">
              <StickyNote className="size-[18px] shrink-0 text-fg-secondary" strokeWidth={1.8} aria-hidden />
              <dt className="text-[14px] text-fg-secondary">Nota</dt>
              <dd className="m-0 min-w-0 flex-1 truncate text-right text-[14px] font-semibold text-fg">{transfer.description}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-col gap-2 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          {effect.fromAfterCents == null && <p>{effect.text}</p>}
          {effect.warning && <p className="font-semibold text-fg">{effect.warning}</p>}
        </div>
        {saveError && <DialogSaveError title="No se pudo eliminar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
