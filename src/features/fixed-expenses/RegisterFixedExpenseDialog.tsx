import { useMemo, useState } from 'react'
import { format, getDate, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight, ListChecks, Search } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogEmptyNote } from '@/components/ui/dialog-parts'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchInput } from '@/components/ui/SearchInput'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { cycleLabel } from '@/lib/cycle'
import { useCycle } from '@/lib/useCycle'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { useFixedExpensePayments, useFixedExpenseSavings, useFixedExpenses } from '@/features/fixed-expenses/api'
import {
  fixedExpenseStatusKey,
  fixedExpenseUrgency,
  summarizeFixedExpenses,
  type FixedExpenseStatus,
} from '@/features/fixed-expenses/aggregate'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'
import { bagPeriodNoun } from '@/features/fixed-expenses/period'

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
 *
 * Rediseño de modales v2 (R1): cada fila lleva la ficha de su categoría, qué tan urgente es («Venció
 * el 5» en rojo, «Vence el 10», «Bolsa semanal») y cuánto falta, con un chevron — ya no un badge
 * aparte. Buscador y orden arriba, como siempre.
 */
export function RegisterFixedExpenseDialog({ open, onClose }: RegisterFixedExpenseDialogProps) {
  const { cycle, config } = useCycle()
  const [selected, setSelected] = useState<FixedExpenseStatus | null>(null)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('dueDate')
  const { data: fixedExpenses, isPending } = useFixedExpenses()
  const { data: categories } = useCategories(true)
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
        // Bloque 4: `selected.period` YA es el mes de esta instancia.
        period={selected.period}
        alreadyPaidCents={selected.paidCents}
        alreadySavedCents={selected.savedCents}
        alreadySavedMovementCents={selected.savedMovementCents}
        dueDate={selected.dueDate}
      />
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar en un fijo"
      subtitle={
        !isPending && pending.length > 0 ? (
          <>
            <span className="capitalize">{cycleLabel(cycle)}</span> · {pending.length} pendiente{pending.length === 1 ? '' : 's'}
          </>
        ) : undefined
      }
    >
      {isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <DialogEmptyNote icon={<ListChecks />}>No tenés fijos pendientes este ciclo</DialogEmptyNote>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fijo…"
              className="flex-1"
            />
            <SegmentedToggle variant="tabs" value={sortBy} options={sortOptions} onChange={setSortBy} />
          </div>

          {/* Alto acotado con scroll propio, no el del `Dialog` entero — así el buscador y el
              orden quedan siempre a la vista aunque la lista de pendientes sea larga. */}
          {visible.length === 0 ? (
            <DialogEmptyNote icon={<Search />}>Ningún fijo coincide con la búsqueda</DialogEmptyNote>
          ) : (
            <ul className="flex max-h-[45vh] flex-col overflow-y-auto rounded-panel-sm border border-border">
              {visible.map((status) => {
                const urgency = status.dueDate ? fixedExpenseUrgency(parseISO(status.dueDate), today) : null
                // Bloque 4: con `cycle.months.length > 1` (semana a caballo de dos meses) un mismo
                // fijo puede listarse dos veces — una instancia por mes — así que hace falta
                // distinguirlas.
                const monthLabel = cycle.months.length > 1 ? format(parseISO(status.period), 'MMM', { locale: es }) : null
                const category = (categories ?? []).find((c) => c.id === status.fe.category_id)
                // Una bolsa no vence, así que no tiene urgencia: dice su frecuencia. L2 del QA: el día
                // real materializado, no `fe.due_day` crudo.
                const due = status.dueDate ? getDate(parseISO(status.dueDate)) : null
                const sub = status.fe.is_recurring
                  ? `Recurrente ${bagPeriodNoun(status.fe.bag_frequency).adjective}`
                  : due != null
                    ? `${urgency === 'red' ? 'Venció' : 'Vence'} el ${due}`
                    : null
                return (
                  <li key={fixedExpenseStatusKey(status)} className="border-b border-divider-list last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setSelected(status)}
                      className="flex min-h-[62px] w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-fill-subtle"
                    >
                      <CategoryChip {...chipLook(category)} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold text-fg">
                          {status.fe.name}
                          {monthLabel && <span className="font-normal text-fg-muted"> · {monthLabel}</span>}
                        </p>
                        {sub && <p className={urgency === 'red' ? 'text-[12px] font-semibold text-negative' : 'text-[12px] text-fg-secondary'}>{sub}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end">
                        <Money cents={status.remainingCents} tone="fg" size="inline" />
                        {status.fe.is_recurring && <span className="text-[11.5px] text-fg-muted">quedan</span>}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden />
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
