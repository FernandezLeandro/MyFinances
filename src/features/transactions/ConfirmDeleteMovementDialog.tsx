import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import type { ConfirmDeleteMovementCopy } from './aggregate'

interface ConfirmDeleteMovementDialogProps {
  open: boolean
  busy: boolean
  /** El texto ya armado — `confirmDeleteMovementCopy` (Movimientos.tsx, el toque de Básico) u
   *  `originDeleteCopy` (`TransactionFormDialog`, que cubre todos los orígenes desde el Bloque 3 del
   *  arreglo de Movimientos). El diálogo sólo lo muestra, no decide qué texto usar. */
  copy: ConfirmDeleteMovementCopy
  onClose: () => void
  onConfirm: () => void
}

/**
 * Confirma antes de borrar un movimiento — Bloque 1 del QA de Fijos (FI-03, FI-05) para el pago/
 * guardado de un fijo, y Bloque 1/3 del arreglo de Movimientos (MO-01 a MO-06) para el resto de los
 * orígenes. La montan `TransactionFormDialog` (botón Eliminar) y `Movimientos.tsx` (el toque de una
 * fila en Básico). Nació como `RemoveLinkedMovementDialog` en `features/fixed-expenses`, sólo para
 * lo vinculado a un fijo; se generalizó y se mudó acá porque ya cubre cualquier movimiento.
 */
export function ConfirmDeleteMovementDialog({ open, busy, copy, onClose, onConfirm }: ConfirmDeleteMovementDialogProps) {
  if (!open) return null

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
