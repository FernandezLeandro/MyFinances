import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useFixedExpensePayments,
  useFixedExpenses,
  useMarkFixedExpensePaid,
  useProjectedBalance,
  useUnmarkFixedExpensePaid,
  type FixedExpense,
} from '@/features/fixed-expenses/api'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'

export function Fijos() {
  const [month, setMonth] = useState(() => new Date())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FixedExpense | null>(null)

  const period = format(startOfMonth(month), 'yyyy-MM-dd')
  const isCurrentMonth = isSameMonth(month, new Date())
  const todayDay = new Date().getDate()

  const { data: fixedExpenses } = useFixedExpenses()
  const { data: payments } = useFixedExpensePayments(period)
  const { data: currentBalance } = useCurrentBalance()
  const { data: projectedBalance } = useProjectedBalance(period)
  const { data: categories } = useCategories(true)
  const markPaid = useMarkFixedExpensePaid()
  const unmarkPaid = useUnmarkFixedExpensePaid()

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const paymentByFixedId = useMemo(
    () => new Map((payments ?? []).map((p) => [p.fixed_expense_id, p])),
    [payments],
  )

  const eligible = useMemo(() => {
    const periodStart = startOfMonth(month)
    const periodEnd = endOfMonth(month)
    return (fixedExpenses ?? []).filter((fe) => {
      if (new Date(fe.starts_on) > periodEnd) return false
      if (fe.ends_on && new Date(fe.ends_on) < periodStart) return false
      return true
    })
  }, [fixedExpenses, month])

  const sorted = [...eligible].sort((a, b) => a.due_day - b.due_day)
  const pending = sorted.filter((fe) => !paymentByFixedId.has(fe.id))
  const pendingTotal = pending.reduce((acc, fe) => acc + fe.cents, 0)

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(fe: FixedExpense) {
    setEditing(fe)
    setFormOpen(true)
  }

  function togglePaid(fe: FixedExpense) {
    if (paymentByFixedId.has(fe.id)) {
      unmarkPaid.mutate({ fixedExpenseId: fe.id, period })
    } else {
      markPaid.mutate({ fixedExpenseId: fe.id, period })
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              aria-label="Mes anterior"
              className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
            >
              <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
                <path d="M7.5 2.5 3.5 6l4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <p className="eyebrow">{format(month, 'MMMM yyyy', { locale: es })}</p>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
              className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
            >
              <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
                <path d="M4.5 2.5 8.5 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <h1 className="mt-2 font-display text-figure font-semibold">Gastos fijos</h1>
        </div>
        <Button onClick={openNew} icon={<span className="text-base leading-none">+</span>}>
          Nuevo fijo
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Del mes" hint="Ordenados por día de vencimiento" />
          {sorted.length === 0 ? (
            <EmptyState
              glyph="◷"
              title="Todavía no cargaste gastos fijos"
              hint="Alquiler, servicios, suscripciones… lo que se repite todos los meses."
              action={<Button onClick={openNew}>Nuevo fijo</Button>}
            />
          ) : (
            <ul className="pb-3">
              {sorted.map((fe) => {
                const payment = paymentByFixedId.get(fe.id)
                const paid = !!payment
                const vencido = isCurrentMonth && !paid && fe.due_day < todayDay
                const busy = markPaid.isPending || unmarkPaid.isPending

                return (
                  <li
                    key={fe.id}
                    className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => togglePaid(fe)}
                      aria-pressed={paid}
                      aria-label={paid ? `${fe.name}: pagado` : `${fe.name}: marcar como pagado`}
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-chip transition-colors duration-150 disabled:opacity-50',
                        paid ? 'bg-acid text-ink-950' : 'bg-ink-800 text-transparent hover:bg-ink-700',
                      )}
                    >
                      <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                        <path
                          d="M2.5 6.2 5 8.6l4.5-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    <button type="button" onClick={() => openEdit(fe)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryById.get(fe.category_id ?? '')?.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-[14px]', paid ? 'text-chalk-faint' : 'text-chalk')}>{fe.name}</p>
                        <p className="mt-0.5 text-[12px]">
                          <span className={vencido ? 'text-coral' : 'text-chalk-faint'}>
                            {vencido ? `Venció el ${fe.due_day}` : `Vence el ${fe.due_day}`}
                          </span>
                        </p>
                      </div>
                    </button>

                    <Money cents={fe.cents} tone={paid ? 'dim' : 'chalk'} />
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel className="p-6 ring-1 ring-acid/15">
            <p className="eyebrow">Saldo proyectado a fin de mes</p>
            <Money cents={projectedBalance ?? 0} tone="chalk" size="figure" className="mt-2" />

            <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">Saldo actual</dt>
                <dd>
                  <Money cents={currentBalance ?? 0} tone="dim" />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">Fijos por pagar ({pending.length})</dt>
                <dd>
                  <Money cents={-pendingTotal} tone="coral" />
                </dd>
              </div>
            </dl>
          </Panel>

          {pending.length > 0 && (
            <Panel tone="flat">
              <PanelHeader title="Fijos pendientes" hint={`${pending.length} sin abonar este mes`} />
              <ul className="px-6 pb-5">
                {pending.map((fe) => (
                  <li key={fe.id} className="flex items-center gap-3 border-t border-ink-850 py-2.5 first:border-t-0">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryById.get(fe.category_id ?? '')?.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{fe.name}</span>
                    <span className="tnum text-[12px] text-chalk-faint">día {fe.due_day}</span>
                    <Money cents={fe.cents} tone="dim" />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {formOpen && <FixedExpenseFormDialog open={formOpen} onClose={() => setFormOpen(false)} fixedExpense={editing} />}
    </div>
  )
}
