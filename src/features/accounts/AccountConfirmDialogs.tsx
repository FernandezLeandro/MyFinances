import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { mensajeDeError } from '@/lib/errors'
import { useAccountDeleteImpact, type BalanceLocation } from '@/features/accounts/api'
import { deleteImpactText } from '@/features/accounts/aggregate'

interface DeleteAccountDialogProps {
  onClose: () => void
  account: BalanceLocation
  isLastAccount: boolean
  /** Sólo si se puede archivar (no es la última cuenta activa): "Mejor archivar" es la salida
   *  amable para quien sólo quiere dejar de usarla. Archiva y cierra. */
  onArchive?: () => Promise<void>
  onConfirm: () => Promise<void>
}

/** Eliminar se lleva la cuenta con sus movimientos y transferencias (`rpc_delete_account`), y no se
 *  puede deshacer — por eso siempre confirma y dice cuánto se borra. Lo que se pagó desde esa cuenta
 *  (fijos, tarjetas, deudas) sigue como pagado.
 *
 *  Las dos salidas (Eliminar, Mejor archivar) fallan adentro del diálogo, que no se cierra. */
export function DeleteAccountDialog({ onClose, account, isLastAccount, onArchive, onConfirm }: DeleteAccountDialogProps) {
  const { data: impact, isPending: isImpactPending } = useAccountDeleteImpact(account.id)
  const [busy, setBusy] = useState<'delete' | 'archive' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function run(kind: 'delete' | 'archive', action: () => Promise<void>) {
    setBusy(kind)
    setSaveError(null)
    try {
      await action()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`¿Eliminar ${account.name || 'la cuenta'}?`}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar
          start={
            onArchive && (
              <Button variant="ghost" size="sm" onClick={() => run('archive', onArchive)} disabled={busy !== null} loading={busy === 'archive'}>
                Mejor archivar
              </Button>
            )
          }
        >
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy !== null}>
            Cancelar
          </Button>
          <Button
            variant="dangerSolid"
            size="dialogFooter"
            onClick={() => run('delete', onConfirm)}
            disabled={isImpactPending || busy === 'archive'}
            loading={busy === 'delete'}
          >
            {busy === 'delete' ? 'Eliminando…' : saveError && busy === null ? 'Reintentar' : 'Eliminar'}
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
        <p>{impact ? deleteImpactText(impact, isLastAccount) : 'Calculando lo que se borra…'}</p>
        <p>
          Los fijos, tarjetas y deudas que pagaste con esta cuenta siguen como pagados. No se puede deshacer.
          {onArchive && ' Si sólo querés dejar de usarla, archivala: la podés reactivar cuando quieras.'}
        </p>
        {saveError && (
          <DialogSaveError title="No se pudo completar">{saveError}</DialogSaveError>
        )}
      </div>
    </Dialog>
  )
}
