import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDeleteFixedExpense, useFixedExpensePaymentHistory, type FixedExpense } from '@/features/fixed-expenses/api'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'

interface FixedExpenseDetailDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
}

/** Historial de pagos de un fijo, con edición de la plantilla on-demand. Mismo patrón que
 *  BucketDetailDialog en Patrimonio: el detalle abierto, y desde ahí se entra a editar. */
export function FixedExpenseDetailDialog({ open, onClose, fixedExpense }: FixedExpenseDetailDialogProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { data: payments, isPending } = useFixedExpensePaymentHistory(fixedExpense.id)
  const deleteFixedExpense = useDeleteFixedExpense()

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir "Editar" encima, porque `open` de este Dialog baja a
  // false). Sin este filtro, editar cerraba todo el historial de un tirón — mismo gotcha que ya
  // apareció en Patrimonio y en Ajustar saldo.
  function handleDetailClose() {
    if (!formOpen && !confirmingDelete) onClose()
  }

  function handleConfirmDelete() {
    deleteFixedExpense.mutate(fixedExpense.id, { onSuccess: () => onClose() })
  }

  return (
    <>
      <Dialog
        open={open && !formOpen && !confirmingDelete}
        onClose={handleDetailClose}
        title={fixedExpense.name}
        footer={
          <>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Eliminar
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(true)}>
              Editar
            </Button>
          </>
        }
      >
        <div className="mb-5 border-b border-ink-850 pb-5">
          <p className="eyebrow">Importe actual</p>
          <Money cents={fixedExpense.cents} tone="dim" size="figure" className="mt-1" />
          <p className="mt-2 text-[12px] text-chalk-faint">Vence el {fixedExpense.due_day}</p>
        </div>

        <p className="eyebrow mb-3">Historial de pagos</p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !payments || payments.length === 0 ? (
          <EmptyState glyph="◷" title="Todavía no registraste pagos de este fijo" />
        ) : (
          <ul className="-mx-6 flex max-h-[50vh] flex-col overflow-y-auto">
            {payments.map((payment) => (
              // Fila inerte a propósito: en esta versión no se puede editar un pago histórico
              // (para corregir uno, se desmarca y se vuelve a marcar) — un botón que no hace nada
              // es peor que ningún botón.
              <li key={payment.id} className="flex items-center gap-3 border-t border-ink-850 px-6 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-chalk capitalize">{format(parseISO(payment.period), 'MMMM yyyy', { locale: es })}</p>
                  <p className="mt-0.5 text-[12px] text-chalk-faint">
                    Pagado el {format(parseISO(payment.paid_at), "d 'de' MMMM", { locale: es })}
                  </p>
                </div>
                <Money cents={payment.amountPaidCents} tone="dim" />
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {formOpen && (
        <FixedExpenseFormDialog open={formOpen} onClose={() => setFormOpen(false)} fixedExpense={fixedExpense} />
      )}

      {confirmingDelete && (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Eliminar gasto fijo"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete} disabled={deleteFixedExpense.isPending}>
                {deleteFixedExpense.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-chalk-dim">
            ¿Eliminar <span className="text-chalk">{fixedExpense.name}</span>?
            {payments && payments.length > 0
              ? ' Se borra también su historial de pagos. Los movimientos ya registrados no se tocan.'
              : ' No se puede deshacer.'}
          </p>
        </Dialog>
      )}
    </>
  )
}
