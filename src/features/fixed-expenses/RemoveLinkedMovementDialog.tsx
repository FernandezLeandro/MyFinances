import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { removeLinkedMovementCopy } from './aggregate'

interface RemoveLinkedMovementDialogProps {
  open: boolean
  busy: boolean
  /** `payment`: el toque en Movimientos (Básico, FI-05) o el botón Eliminar sobre un movimiento de
   *  pago. `saving`: el botón Eliminar sobre el movimiento de un guardado (FI-03). */
  kind: 'payment' | 'saving'
  /** La descripción del propio movimiento — mismo criterio que `TransactionRow`. */
  description: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * Confirma antes de quitar un pago o eliminar un guardado con movimiento — Bloque 1 del QA de Fijos
 * (FI-03, FI-05): hasta acá esto pasaba al instante, sin aviso. La montan `Movimientos.tsx` (el
 * toque de una fila en Básico) y `TransactionFormDialog` (el botón Eliminar). El freno
 * `payment_before_accounts` sigue siendo aparte (`UnmarkBeforeAccountsDialog`): éste confirma la
 * intención, aquél avisa una consecuencia distinta (contar la plata dos veces) que sólo aplica a un
 * pago anterior a las cuentas.
 */
export function RemoveLinkedMovementDialog({ open, busy, kind, description, onClose, onConfirm }: RemoveLinkedMovementDialogProps) {
  if (!open) return null

  const copy = removeLinkedMovementCopy({ kind, description })

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="dangerSolid" size="dialogFooter" onClick={onConfirm} loading={busy}>
            {copy.confirmLabel}
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
        {copy.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </Dialog>
  )
}
