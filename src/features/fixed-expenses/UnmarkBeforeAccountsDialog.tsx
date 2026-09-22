import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { useCan } from '@/features/access/useCan'
import { preAccountsPaymentCopy } from './aggregate'

interface UnmarkBeforeAccountsDialogProps {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  /** `unmark` (default): el ✕ de Fijos, el detalle del fijo, o el tap de la fila en Movimientos
   *  (Básico) — sólo se quita el pago. `delete`: el botón «Eliminar» del formulario de movimiento
   *  (`TransactionFormDialog`, N4 del QA) — se borra el movimiento entero, mismo freno. */
  action?: 'unmark' | 'delete'
}

/** El freno de `payment_before_accounts` (`rpc_unmark_fixed_expense_payment`). Lo abre
 *  `useUnmarkWithLegacyConfirm` desde Fijos, el detalle del fijo, Movimientos (plan Básico) y el botón
 *  Eliminar del formulario de movimiento — una sola pieza para los cuatro. El texto, según plan y
 *  acción, sale de `preAccountsPaymentCopy`. */
export function UnmarkBeforeAccountsDialog({ open, busy, onClose, onConfirm, action = 'unmark' }: UnmarkBeforeAccountsDialogProps) {
  const canEditMovement = useCan('movimientos-manuales')
  const canCuentas = useCan('cuentas')

  if (!open) return null

  const copy = preAccountsPaymentCopy({ action, canCuentas, canEditMovement })

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
