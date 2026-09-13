import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Money } from '@/components/ui/Money'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchInput } from '@/components/ui/SearchInput'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { useCycle } from '@/lib/useCycle'
import { useFixedExpensePayments, useFixedExpenseSavings, useFixedExpenses } from '@/features/fixed-expenses/api'
import { fixedExpenseUrgency, summarizeFixedExpenses, type FixedExpenseStatus } from '@/features/fixed-expenses/aggregate'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'

interface RegisterFixedExpenseDialogProps {
  open: boolean
  onClose: () => void
}

type SortBy = 'dueDate' | 'name'

const sortOptions = [
  { value: 'dueDate' as const, label: 'Vencimiento' },
  { value: 'name' as const, label: 'Nombre' },
]

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
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('dueDate')
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? pending.filter((status) => status.fe.name.toLowerCase().includes(q)) : pending
    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.fe.name.localeCompare(b.fe.name)
      // Sin vencimiento (bolsas sin due date del ciclo) al final, no primero — no tiene sentido
      // que "no vence" gane contra algo que sí tiene fecha.
      if (!a.dueDate) return !b.dueDate ? 0 : 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    })
  }, [pending, query, sortBy])

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
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fijo…"
              className="flex-1"
            />
            <SegmentedToggle value={sortBy} options={sortOptions} onChange={setSortBy} />
          </div>

          {/* Alto acotado con scroll propio, no el del `Dialog` entero — así el buscador y el
              orden quedan siempre a la vista aunque la lista de pendientes sea larga. */}
          {visible.length === 0 ? (
            <EmptyState glyph="◷" title="Ningún fijo coincide con la búsqueda" />
          ) : (
            <ul className="-mx-6 flex max-h-[45vh] flex-col overflow-y-auto">
              {visible.map((status) => {
                const urgency = status.dueDate ? fixedExpenseUrgency(parseISO(status.dueDate), today) : null
                return (
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
                      {/* Mismo badge de urgencia que Fijos.tsx — una bolsa no vence, así que no le
                          corresponde. */}
                      {urgency && (
                        <Badge variant={urgency} className="shrink-0 whitespace-nowrap">
                          {urgency === 'red' ? `Venció el ${status.fe.due_day}` : `Vence el ${status.fe.due_day}`}
                        </Badge>
                      )}
                      <Money cents={status.remainingCents} tone="fg" size="row" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  )
}
