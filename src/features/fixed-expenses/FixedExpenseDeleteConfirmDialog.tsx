import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogConfirmStack, DialogItemCard } from '@/components/ui/dialog-parts'
import { Money } from '@/components/ui/Money'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { useDeleteFixedExpense, useFixedExpensePaymentHistory, type FixedExpense } from '@/features/fixed-expenses/api'
import { fixedExpenseScheduleLabel } from '@/features/fixed-expenses/period'

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
 *  null`).
 *
 *  Confirmación «Pila» (rediseño de modales v2): tarjeta con la ficha del fijo, texto de la
 *  consecuencia y la acción sólida a todo el ancho. */
export function FixedExpenseDeleteConfirmDialog({
  open,
  onClose,
  fixedExpense,
  onDeleted,
}: FixedExpenseDeleteConfirmDialogProps) {
  const { data: payments } = useFixedExpensePaymentHistory(open ? fixedExpense.id : null)
  const deleteFixedExpense = useDeleteFixedExpense()
  const { data: categories } = useCategories(true)
  const category = (categories ?? []).find((c) => c.id === fixedExpense.category_id)

  function handleConfirm() {
    deleteFixedExpense.mutate(fixedExpense.id, { onSuccess: onDeleted })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      ownsPending
      title="Eliminar gasto fijo"
      icon={<Trash2 className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      tone="danger"
      footer={
        <DialogConfirmStack
          confirmLabel="Eliminar fijo"
          pendingLabel="Eliminando…"
          pending={deleteFixedExpense.isPending}
          onConfirm={handleConfirm}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <DialogItemCard
          leading={<CategoryChip {...chipLook(category)} size={38} />}
          title={fixedExpense.name}
          meta={[
            fixedExpenseScheduleLabel(fixedExpense).replace(/^./, (c) => c.toUpperCase()),
            payments && payments.length > 0 ? `${payments.length} pago${payments.length === 1 ? '' : 's'} registrado${payments.length === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          amount={<Money cents={fixedExpense.cents} tone="fg" />}
        />
        <p className="text-[14px] text-fg-secondary">
          {payments && payments.length > 0
            ? 'Se borra también su historial de pagos. Los movimientos ya registrados no se tocan.'
            : 'No se puede deshacer.'}
        </p>
      </div>
    </Dialog>
  )
}
