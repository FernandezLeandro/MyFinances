import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { useDeleteFixedExpense, useFixedExpensePaymentHistory, type FixedExpense } from '@/features/fixed-expenses/api'

interface FixedExpenseDeleteConfirmDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
  /** Se llama después de borrar con éxito — normalmente cierra también el diálogo desde el que se
   *  entró a confirmar (el form de edición o el detalle). */
  onDeleted: () => void
}

/** Confirmación de borrado de un fijo, compartida entre `FixedExpenseFormDialog` (Bloque 1: ahora se
 *  puede eliminar desde la edición) y `FixedExpenseDetailDialog`. El aviso cambia según si el fijo
 *  tiene historial de pagos: borrarlo se lleva ese historial (`on delete cascade`), pero los
 *  movimientos ya generados quedan (`transactions.fixed_expense_payment_id` es `on delete set
 *  null`). */
export function FixedExpenseDeleteConfirmDialog({
  open,
  onClose,
  fixedExpense,
  onDeleted,
}: FixedExpenseDeleteConfirmDialogProps) {
  const { data: payments } = useFixedExpensePaymentHistory(open ? fixedExpense.id : null)
  const deleteFixedExpense = useDeleteFixedExpense()

  function handleConfirm() {
    deleteFixedExpense.mutate(fixedExpense.id, { onSuccess: onDeleted })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Eliminar gasto fijo"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="dialogFooter" onClick={handleConfirm} disabled={deleteFixedExpense.isPending}>
            {deleteFixedExpense.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-fg-secondary">
        ¿Eliminar <span className="text-fg">{fixedExpense.name}</span>?
        {payments && payments.length > 0
          ? ' Se borra también su historial de pagos. Los movimientos ya registrados no se tocan.'
          : ' No se puede deshacer.'}
      </p>
    </Dialog>
  )
}
