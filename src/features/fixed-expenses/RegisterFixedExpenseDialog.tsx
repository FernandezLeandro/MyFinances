import { useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCycle } from '@/lib/useCycle'
import { useFixedExpensePayments, useFixedExpenseSavings, useFixedExpenses } from '@/features/fixed-expenses/api'
import { summarizeFixedExpenses, type FixedExpenseStatus } from '@/features/fixed-expenses/aggregate'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'

interface RegisterFixedExpenseDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * El `+` de un plan sin `movimientos-manuales` (BASIC, bloque 4 del plan): ese plan no registra
 * movimientos sueltos — sólo se generan al pagar (o guardar para) un fijo — así que acá el `+` no
 * abre `TransactionFormDialog`, abre este selector primero. Elegido el fijo, el resto es
 * exactamente `MarkPaidDialog`, el mismo Pagar/Guardar que ya usa Fijos.tsx.
 *
 * Sólo lista los pendientes del ciclo en curso: un fijo ya pagado, o una bolsa que ya llegó a su
 * presupuesto, no tiene nada que registrar acá — para deshacer un pago hace falta ir a Fijos.
 */
export function RegisterFixedExpenseDialog({ open, onClose }: RegisterFixedExpenseDialogProps) {
  const { cycle, config } = useCycle()
  const [selected, setSelected] = useState<FixedExpenseStatus | null>(null)
  const { data: fixedExpenses, isPending } = useFixedExpenses()
  const { data: payments } = useFixedExpensePayments(cycle.months)
  const { data: savings } = useFixedExpenseSavings(cycle.months)

  const today = new Date()
  const { pending } = summarizeFixedExpenses(
    fixedExpenses ?? [],
    payments ?? [],
    today,
    today,
    cycle,
    cycle.months,
    config.weekStartsOn,
    savings ?? [],
  )

  if (selected) {
    return (
      <MarkPaidDialog
        open={open}
        onClose={onClose}
        fixedExpense={selected.fe}
        period={
          selected.dueDate
            ? format(startOfMonth(parseISO(selected.dueDate)), 'yyyy-MM-dd')
            : format(startOfMonth(today), 'yyyy-MM-dd')
        }
        alreadyPaidCents={selected.paidCents}
        alreadySavedCents={selected.savedCents}
      />
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="Registrar en un fijo">
      {isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <EmptyState glyph="◷" title="No tenés fijos pendientes este ciclo" />
      ) : (
        <ul className="-mx-6 flex flex-col">
          {pending.map((status) => (
            <li key={status.fe.id}>
              <button
                type="button"
                onClick={() => setSelected(status)}
                className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors duration-150 hover:bg-fill-subtle"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-fg">{status.fe.name}</p>
                  {status.fe.is_recurring && <p className="text-[12px] text-fg-muted">bolsa</p>}
                </div>
                <Money cents={status.remainingCents} tone="fg" size="row" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
