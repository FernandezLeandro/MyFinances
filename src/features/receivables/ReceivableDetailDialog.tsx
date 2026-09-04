import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDeleteReceivable, useDeleteReceivablePayment, useUnexpenseReceivable } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { RegistrarAbonoDialog } from '@/features/receivables/RegistrarAbonoDialog'
import { ExpenseReceivableDialog } from '@/features/receivables/ExpenseReceivableDialog'

interface ReceivableDetailDialogProps {
  open: boolean
  onClose: () => void
  summary: ReceivableSummary
}

/** Historial de abonos de una deuda, con alta/edición/borrado on-demand. Mismo patrón que
 *  `FixedExpenseDetailDialog`: el detalle abierto, y desde ahí se entra a las demás acciones. */
export function ReceivableDetailDialog({ open, onClose, summary }: ReceivableDetailDialogProps) {
  const { receivable, payments, pendingCents, cobrada, vencida } = summary
  const [formOpen, setFormOpen] = useState(false)
  const [abonoOpen, setAbonoOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteReceivable = useDeleteReceivable()
  const deletePayment = useDeleteReceivablePayment()
  const unexpenseReceivable = useUnexpenseReceivable()

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir "Editar"/"Registrar abono"/"Descontar" encima). Sin
  // este filtro, cualquiera de los cuatro cerraba todo el detalle de un tirón — mismo gotcha que en
  // Fijos/Ahorros.
  function handleDetailClose() {
    if (!formOpen && !abonoOpen && !expenseOpen && !confirmingDelete) onClose()
  }

  function handleConfirmDelete() {
    deleteReceivable.mutate(receivable.id, { onSuccess: () => onClose() })
  }

  return (
    <>
      <Dialog
        open={open && !formOpen && !abonoOpen && !expenseOpen && !confirmingDelete}
        onClose={handleDetailClose}
        title={receivable.name}
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
            {!cobrada && <Button onClick={() => setAbonoOpen(true)}>Registrar abono</Button>}
          </>
        }
      >
        <div className="mb-5 flex flex-col gap-3 border-b border-ink-850 pb-5">
          <div>
            <p className="eyebrow">{cobrada ? 'Cobrada' : 'Pendiente'}</p>
            <Money cents={cobrada ? receivable.amountCents : pendingCents} tone={cobrada ? 'dim' : 'acid'} size="figure" className="mt-1" />
            {!cobrada && payments.length > 0 && (
              <p className="mt-1 text-[12px] text-chalk-faint">
                de <Money cents={receivable.amountCents} tone="dim" /> en total
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <span className={vencida ? 'text-coral' : 'text-chalk-faint'}>
              {receivable.expected_period
                ? `${vencida ? 'Venció en' : 'Esperada para'} ${format(parseISO(receivable.expected_period), 'MMMM yyyy', { locale: es })}`
                : 'Sin fecha esperada'}
            </span>
            <span className="text-chalk-faint">
              {!receivable.already_expensed
                ? 'Le prestaste efectivo'
                : receivable.expense_transaction_id != null
                  ? 'Descontado de tu saldo'
                  : 'Ya lo cargaste como gasto'}
            </span>
          </div>

          {/* Link de texto y no un botón más en el footer: ya tiene tres (Eliminar/Cerrar/Editar +
              Registrar abono) y un quinto ahí desborda en mobile. Mismo patrón que "+ Agregar lugar"
              de Cuadrar Saldo. */}
          {!cobrada &&
            (!receivable.already_expensed ? (
              <button
                type="button"
                onClick={() => setExpenseOpen(true)}
                className="self-start text-[12px] font-medium text-acid hover:underline"
              >
                Descontar de mi saldo
              </button>
            ) : (
              receivable.expense_transaction_id != null && (
                <button
                  type="button"
                  onClick={() => unexpenseReceivable.mutate(receivable.id)}
                  disabled={unexpenseReceivable.isPending}
                  className="self-start text-[12px] font-medium text-acid hover:underline disabled:opacity-40"
                >
                  {unexpenseReceivable.isPending ? 'Deshaciendo…' : 'Deshacer descuento'}
                </button>
              )
            ))}

          {receivable.note && <p className="text-[13px] text-chalk-dim">{receivable.note}</p>}
        </div>

        <p className="eyebrow mb-3">Historial de abonos</p>
        {payments.length === 0 ? (
          <EmptyState glyph="◷" title="Todavía no registraste abonos" />
        ) : (
          <ul className="-mx-6 flex max-h-[40vh] flex-col overflow-y-auto">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 border-t border-ink-850 px-6 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-chalk-dim">{format(parseISO(payment.occurred_on), "d 'de' MMMM", { locale: es })}</p>
                  {payment.transaction_id && <p className="mt-0.5 text-[11px] text-chalk-faint">Registró un ingreso</p>}
                </div>
                <Money cents={payment.amountCents} tone="dim" size="inline" />
                <button
                  type="button"
                  onClick={() => deletePayment.mutate(payment.id)}
                  disabled={deletePayment.isPending}
                  aria-label="Quitar este abono"
                  className="grid size-6 shrink-0 place-items-center rounded-chip text-chalk-faint transition-colors duration-150 hover:bg-ink-800 hover:text-coral disabled:opacity-40"
                >
                  <X className="size-3" strokeWidth={1.5} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {formOpen && (
        <ReceivableFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          receivable={receivable}
          hasPayments={payments.length > 0}
        />
      )}

      {abonoOpen && <RegistrarAbonoDialog open={abonoOpen} onClose={() => setAbonoOpen(false)} summary={summary} />}

      {expenseOpen && (
        <ExpenseReceivableDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} summary={summary} />
      )}

      {confirmingDelete && (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Eliminar deuda"
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete} disabled={deleteReceivable.isPending}>
                {deleteReceivable.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-chalk-dim">
            ¿Eliminar <span className="text-chalk">{receivable.name}</span>?
            {payments.length > 0
              ? ' Se borra también su historial de abonos. Los movimientos ya registrados no se tocan.'
              : ' No se puede deshacer.'}
          </p>
        </Dialog>
      )}
    </>
  )
}
