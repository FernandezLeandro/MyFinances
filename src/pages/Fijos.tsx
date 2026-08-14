import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useFixedExpensePayments,
  useFixedExpenses,
  useProjectedBalance,
  useUnmarkFixedExpensePaid,
  type FixedExpense,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/api'
import { eligibleFixedExpenses } from '@/features/fixed-expenses/period'
import { FixedExpenseDetailDialog } from '@/features/fixed-expenses/FixedExpenseDetailDialog'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'
import { ObligacionesTabs } from '@/features/credits/ObligacionesTabs'
import { summarizeCredits } from '@/features/credits/aggregate'
import { useCreditCardPayments, useCreditCardSavings, useCreditCards, useCreditInstallments } from '@/features/credits/api'

function FixedExpenseRow({
  fe,
  payment,
  categoryColor,
  vencido,
  busy,
  hidden,
  onTogglePaid,
  onOpenDetail,
}: {
  fe: FixedExpense
  payment: FixedExpensePayment | undefined
  categoryColor: string | undefined
  vencido: boolean
  busy: boolean
  hidden: boolean
  onTogglePaid: () => void
  onOpenDetail: () => void
}) {
  const paid = !!payment

  return (
    <li className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850">
      <button
        type="button"
        disabled={busy}
        onClick={onTogglePaid}
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

      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${fe.name}: ver detalle`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[14px]', paid ? 'text-chalk-faint' : 'text-chalk')}>{fe.name}</p>
          <p className="mt-0.5 text-[12px]">
            <span className={vencido ? 'text-coral' : 'text-chalk-faint'}>
              {vencido ? `Venció el ${fe.due_day}` : `Vence el ${fe.due_day}`}
            </span>
          </p>
        </div>
      </button>

      {/* Pagado: se muestra lo que realmente salió (amountPaidCents), no la plantilla — con un mes
          en curso ambos suelen coincidir (el pago actualiza la plantilla), pero en un mes pasado o
          si el pago no tocó la plantilla, pueden diferir. */}
      <Money cents={payment ? payment.amountPaidCents : fe.cents} tone={paid ? 'dim' : 'chalk'} hidden={hidden} />
    </li>
  )
}

export function Fijos() {
  const [month, setMonth] = useState(() => new Date())
  const [formOpen, setFormOpen] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<FixedExpense | null>(null)
  const [detailFixed, setDetailFixed] = useState<FixedExpense | null>(null)
  const [showPaused, setShowPaused] = useState(false)
  const [paidExpanded, setPaidExpanded] = useState(false)

  const period = format(startOfMonth(month), 'yyyy-MM-dd')
  const isCurrentMonth = isSameMonth(month, new Date())
  const todayDay = new Date().getDate()

  const { data: fixedExpenses, isPending, isError, refetch } = useFixedExpenses(showPaused)
  const { data: payments } = useFixedExpensePayments(period)
  const { data: currentBalance } = useCurrentBalance()
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)
  const { data: categories } = useCategories(true)
  const unmarkPaid = useUnmarkFixedExpensePaid()

  const { data: cards } = useCreditCards()
  const { data: installments } = useCreditInstallments(period)
  const { data: savings } = useCreditCardSavings(period)
  const { data: cardPayments } = useCreditCardPayments(period)

  // Sin botón propio acá: el toggle vive en Hoy y comparte clave, así que ocultar el saldo ahí
  // también enmascara los importes de esta pantalla — un solo control, no uno por pantalla.
  const [balanceHidden] = useHiddenBalance('saldo-actual')

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const paymentByFixedId = useMemo(
    () => new Map((payments ?? []).map((p) => [p.fixed_expense_id, p])),
    [payments],
  )
  const creditsSummary = useMemo(
    () => summarizeCredits(cards ?? [], installments ?? [], savings ?? [], cardPayments ?? []),
    [cards, installments, savings, cardPayments],
  )
  const unpaidCardsCount = creditsSummary.perCard.filter((c) => !c.paid).length

  const eligible = useMemo(
    () => eligibleFixedExpenses(fixedExpenses ?? [], startOfMonth(month), endOfMonth(month)),
    [fixedExpenses, month],
  )

  const sorted = [...eligible].sort((a, b) => a.due_day - b.due_day)
  const active = sorted.filter((fe) => fe.is_active)
  const pending = active.filter((fe) => !paymentByFixedId.has(fe.id))
  const paidItems = active.filter((fe) => paymentByFixedId.has(fe.id))
  const pausedItems = sorted.filter((fe) => !fe.is_active)
  const pendingTotal = pending.reduce((acc, fe) => acc + fe.cents, 0)

  function openNew() {
    setFormOpen(true)
  }

  function togglePaid(fe: FixedExpense) {
    if (paymentByFixedId.has(fe.id)) {
      // Desmarcar sigue siendo un toque, sin diálogo: es reversible y es el control más usado de
      // la pantalla. Sólo el camino "no pagado → pagado" necesita preguntar el importe.
      unmarkPaid.mutate({ fixedExpenseId: fe.id, period })
    } else {
      setMarkingPaid(fe)
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
          <div className="mt-3">
            <ObligacionesTabs />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPaused((v) => !v)}
            aria-pressed={showPaused}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-medium whitespace-nowrap',
              'transition-colors duration-150',
              showPaused
                ? 'border-ink-600 bg-ink-800 text-chalk'
                : 'border-ink-800 bg-transparent text-chalk-faint hover:border-ink-700 hover:text-chalk-dim',
            )}
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <rect x="3" y="2" width="2" height="8" rx="0.6" fill="currentColor" />
              <rect x="7" y="2" width="2" height="8" rx="0.6" fill="currentColor" />
            </svg>
            Pausados
          </button>
          <Button onClick={openNew} icon={<span className="text-base leading-none">+</span>}>
            Nuevo fijo
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* En mobile el saldo proyectado va primero (order-1) para no tener que scrollear pasando
            toda la lista de fijos sólo para verlo — en desktop (lg:) vuelve a su lugar a la derecha
            de la lista, sin tocar el layout de dos columnas. */}
        <Panel className="order-2 lg:order-1 lg:col-span-2">
          <PanelHeader title="Del mes" hint="Ordenados por día de vencimiento" />
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isPending ? (
            <ul className="flex flex-col gap-1 px-6 py-5">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-5 shrink-0" />
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </li>
              ))}
            </ul>
          ) : sorted.length === 0 ? (
            <EmptyState
              glyph="◷"
              title="Todavía no cargaste gastos fijos"
              hint="Alquiler, servicios, suscripciones… lo que se repite todos los meses."
              action={<Button onClick={openNew}>Nuevo fijo</Button>}
            />
          ) : (
            <>
              {pending.length === 0 && (
                <p className="px-6 pt-2 pb-4 text-[13px] text-chalk-faint">No tenés nada por pagar este mes.</p>
              )}
              <ul className="pb-3">
                {pending.map((fe) => (
                  <FixedExpenseRow
                    key={fe.id}
                    fe={fe}
                    payment={paymentByFixedId.get(fe.id)}
                    categoryColor={categoryById.get(fe.category_id ?? '')?.color}
                    vencido={isCurrentMonth && fe.due_day < todayDay}
                    busy={unmarkPaid.isPending}
                    hidden={balanceHidden}
                    onTogglePaid={() => togglePaid(fe)}
                    onOpenDetail={() => setDetailFixed(fe)}
                  />
                ))}
              </ul>

              {paidItems.length > 0 && (
                <div className="border-t border-ink-850 pt-1 pb-3">
                  <button
                    type="button"
                    onClick={() => setPaidExpanded((v) => !v)}
                    aria-expanded={paidExpanded}
                    className="eyebrow flex w-full items-center gap-1.5 px-6 pt-3 pb-1 text-left transition-colors duration-150 hover:text-chalk"
                  >
                    <svg
                      viewBox="0 0 12 12"
                      className={cn('size-2.5 shrink-0 transition-transform duration-150', paidExpanded && 'rotate-90')}
                      aria-hidden
                    >
                      <path d="M4.5 2.5 8.5 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Pagados ({paidItems.length})
                  </button>
                  {paidExpanded && (
                    <ul>
                      {paidItems.map((fe) => (
                        <FixedExpenseRow
                          key={fe.id}
                          fe={fe}
                          payment={paymentByFixedId.get(fe.id)}
                          categoryColor={categoryById.get(fe.category_id ?? '')?.color}
                          vencido={false}
                          busy={unmarkPaid.isPending}
                          hidden={balanceHidden}
                          onTogglePaid={() => togglePaid(fe)}
                          onOpenDetail={() => setDetailFixed(fe)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {showPaused && pausedItems.length > 0 && (
                <div className="border-t border-ink-850 pt-1 pb-3">
                  <p className="eyebrow px-6 pt-3 pb-1">Pausados ({pausedItems.length})</p>
                  <ul>
                    {pausedItems.map((fe) => (
                      <li
                        key={fe.id}
                        className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailFixed(fe)}
                          aria-label={`${fe.name}: ver detalle`}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full opacity-50"
                            style={{ backgroundColor: categoryById.get(fe.category_id ?? '')?.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] text-chalk-faint">{fe.name}</p>
                            <p className="mt-0.5 text-[12px] text-chalk-faint">Pausado · vence el {fe.due_day}</p>
                          </div>
                        </button>
                        <Money cents={fe.cents} tone="dim" hidden={balanceHidden} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>

        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <SaldoProyectadoPanel
            period={period}
            projectedCents={projectedBalance}
            isPending={isProjectedPending}
            currentBalanceCents={currentBalance ?? 0}
            pendingFixedCount={pending.length}
            pendingFixedCents={pendingTotal}
            unpaidCardsCount={unpaidCardsCount}
            unpaidCardsCents={creditsSummary.totalPendingCents}
            hidden={balanceHidden}
          />

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
                    <Money cents={fe.cents} tone="dim" hidden={balanceHidden} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {formOpen && <FixedExpenseFormDialog open={formOpen} onClose={() => setFormOpen(false)} />}
      {markingPaid && (
        <MarkPaidDialog open={!!markingPaid} onClose={() => setMarkingPaid(null)} fixedExpense={markingPaid} period={period} />
      )}
      {detailFixed && (
        <FixedExpenseDetailDialog open={!!detailFixed} onClose={() => setDetailFixed(null)} fixedExpense={detailFixed} />
      )}
    </div>
  )
}
