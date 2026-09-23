import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { accountNameOf, transferDeleteEffect } from '@/features/accounts/aggregate'
import { useDeleteAccountTransfer, type AccountTransfer } from '@/features/accounts/transfers-api'

/** El detalle de una transferencia, con la única acción que admite: eliminarla (no se editan — se
 *  borra y se vuelve a crear). Es el mismo diálogo desde la fila de Movimientos y desde la X de
 *  «Últimas transferencias» en Cuentas: antes esa X borraba sin confirmar, y borrar no tiene tope,
 *  así que puede dejar el destino en negativo — acá se dice antes (`transferDeleteEffect`).
 *
 *  Falla adentro del diálogo, que no se cierra (patrón 5b); el éxito cierra y avisa con un toast. */
export function TransferDetailDialog({ transfer, onClose }: { transfer: AccountTransfer; onClose: () => void }) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const deleteTransfer = useDeleteAccountTransfer()
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const byId = new Map((locations ?? []).map((l) => [l.id, l]))
  const nameOf = (id: string) => accountNameOf(byId, id)
  const effect = transferDeleteEffect({ transfer, balances, nameOf })

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
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button variant="dangerSolid" size="dialogFooter" onClick={remove} loading={busy}>
            {busy ? 'Eliminando…' : saveError ? 'Reintentar' : 'Eliminar'}
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Money cents={transfer.cents} size="total" tone="fg" />
          <p className="mt-2.5 text-[14px] font-medium break-words text-fg">
            {nameOf(transfer.from_account_id)} → {nameOf(transfer.to_account_id)}
          </p>
          <p className="mt-1 text-[12.5px] break-words text-fg-muted">
            {format(parseISO(transfer.occurred_on), "d 'de' MMMM 'de' yyyy", { locale: es })}
            {transfer.description ? ` · ${transfer.description}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          <p>{effect.text}</p>
          {effect.warning && <p className="font-semibold text-fg">{effect.warning}</p>}
        </div>
        {saveError && <DialogSaveError title="No se pudo eliminar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
