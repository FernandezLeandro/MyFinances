import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, ChevronLeft, ChevronRight, Pause, Plus } from 'lucide-react'
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
  useUnmarkFixedExpensePayment,
  type FixedExpense,
} from '@/features/fixed-expenses/api'
import { eligibleFixedExpenses } from '@/features/fixed-expenses/period'
import { summarizeFixedExpenses, type FixedExpenseStatus } from '@/features/fixed-expenses/aggregate'
import { FixedExpenseDetailDialog } from '@/features/fixed-expenses/FixedExpenseDetailDialog'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'
import { ObligacionesTabs } from '@/features/credits/ObligacionesTabs'
import { summarizeCredits } from '@/features/credits/aggregate'
import { useCreditCardPayments, useCreditCardSavings, useCreditCards, useCreditInstallments } from '@/features/credits/api'

function FixedExpenseRow({
  status,
  categoryColor,
  vencido,
  busy,
  hidden,
  onPrimaryAction,
  onOpenDetail,
}: {
  status: FixedExpenseStatus
  categoryColor: string | undefined
  vencido: boolean
  busy: boolean
  hidden: boolean
  onPrimaryAction: () => void
  onOpenDetail: () => void
}) {
  const { fe, paidCents, remainingCents, done, overspentCents } = status
  const overspent = overspentCents > 0

  return (
    <li className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850">
      {fe.is_recurring ? (
        // Una bolsa no se "tilda" — cada carga es un pago suelto, así que el control siempre agrega
        // una carga nueva (incluso ya completa: se puede seguir cargando nafta pasado el
        // presupuesto, sólo que no descuenta más del proyectado). Lo terminado se ve en la barra.
        <button
          type="button"
          onClick={onPrimaryAction}
          aria-label={`${fe.name}: registrar carga`}
          className="grid size-5 shrink-0 place-items-center rounded-chip bg-ink-800 text-chalk-faint transition-colors duration-150 hover:bg-ink-700 hover:text-chalk"
        >
          <Plus className="size-2.5" strokeWidth={1.5} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onPrimaryAction}
          aria-pressed={done}
          aria-label={done ? `${fe.name}: pagado` : `${fe.name}: marcar como pagado`}
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-chip transition-colors duration-150 disabled:opacity-50',
            done ? 'bg-acid text-ink-950' : 'bg-ink-800 text-transparent hover:bg-ink-700',
          )}
        >
          <Check className="size-3" strokeWidth={1.8} aria-hidden />
        </button>
      )}

      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${fe.name}: ver detalle`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[14px]', done && !overspent ? 'text-chalk-faint' : 'text-chalk')}>{fe.name}</p>

          {fe.is_recurring ? (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={cn('h-full rounded-full', overspent ? 'bg-coral' : done ? 'bg-acid' : 'bg-chalk-dim')}
                  style={{ width: `${fe.cents > 0 ? Math.min((paidCents / fe.cents) * 100, 100) : 0}%` }}
                />
              </div>
              {overspent ? (
                <span className="text-[12px] text-coral">
                  Te pasaste <Money cents={overspentCents} tone="coral" hidden={hidden} />
                </span>
              ) : done ? (
                <span className="text-[12px] text-chalk-faint">Completo</span>
              ) : (
                <span className="text-[12px] text-chalk-faint">
                  <Money cents={paidCents} tone="dim" hidden={hidden} /> de <Money cents={fe.cents} tone="dim" hidden={hidden} />
                </span>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-[12px]">
              <span className={vencido ? 'text-coral' : 'text-chalk-faint'}>
                {vencido ? `Venció el ${fe.due_day}` : `Vence el ${fe.due_day}`}
              </span>
            </p>
          )}
        </div>
      </button>

      {/* Fijo único: se muestra lo que realmente salió (paidCents), no la plantilla — con un mes en
          curso ambos suelen coincidir, pero en un mes pasado pueden diferir. Bolsa: lo que resta
          mientras falte, lo cargado una vez completa (el excedente ya se ve en la línea de arriba). */}
      <Money cents={done ? paidCents : remainingCents} tone={done ? 'dim' : 'chalk'} hidden={hidden} />
    </li>
  )
}

export function Fijos() {
  const [month, setMonth] = useState(() => new Date())
  const [formOpen, setFormOpen] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<FixedExpenseStatus | null>(null)
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
  const unmarkPayment = useUnmarkFixedExpensePayment()

  const { data: cards } = useCreditCards()
  const { data: installments } = useCreditInstallments(period)
  const { data: savings } = useCreditCardSavings(period)
  const { data: cardPayments } = useCreditCardPayments(period)

  // Sin botón propio acá: el toggle vive en Hoy y comparte clave, así que ocultar el saldo ahí
  // también enmascara los importes de esta pantalla — un solo control, no uno por pantalla.
  const [balanceHidden] = useHiddenBalance('saldo-actual')

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const creditsSummary = useMemo(
    () => summarizeCredits(cards ?? [], installments ?? [], savings ?? [], cardPayments ?? []),
    [cards, installments, savings, cardPayments],
  )
  const unpaidCardsCount = creditsSummary.perCard.filter((c) => !c.paid).length

  // Todo lo elegible del período, activo o pausado — se usa para el estado vacío general y para la
  // sección de pausados. `summarizeFixedExpenses` hace este mismo filtro puertas adentro, pero sólo
  // para los activos: acá hace falta la lista completa.
  const eligibleAll = useMemo(
    () => eligibleFixedExpenses(fixedExpenses ?? [], startOfMonth(month), endOfMonth(month)),
    [fixedExpenses, month],
  )
  const pausedItems = [...eligibleAll].filter((fe) => !fe.is_active).sort((a, b) => a.due_day - b.due_day)

  const { pending, done: paidItems, pendingTotalCents } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], payments ?? [], month, new Date()),
    [fixedExpenses, payments, month],
  )

  function openNew() {
    setFormOpen(true)
  }

  function handlePrimaryAction(status: FixedExpenseStatus) {
    if (status.fe.is_recurring) {
      // Siempre suma una carga nueva — nunca "desmarca" (para eso está el botón de quitar en el
      // historial de detalle, que sí sabe cuál de varias cargas sacar).
      setMarkingPaid(status)
      return
    }
    if (status.payments.length > 0) {
      // Desmarcar sigue siendo un toque, sin diálogo: es reversible y es el control más usado de
      // la pantalla. Sólo el camino "no pagado → pagado" necesita preguntar el importe.
      unmarkPayment.mutate({ paymentId: status.payments[0].id })
    } else {
      setMarkingPaid(status)
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
              <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
            <p className="eyebrow">{format(month, 'MMMM yyyy', { locale: es })}</p>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
              className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
            >
              <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden />
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
            <Pause className="size-3" fill="currentColor" aria-hidden />
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
          ) : eligibleAll.length === 0 ? (
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
                {pending.map((status) => (
                  <FixedExpenseRow
                    key={status.fe.id}
                    status={status}
                    categoryColor={categoryById.get(status.fe.category_id ?? '')?.color}
                    vencido={isCurrentMonth && status.fe.due_day < todayDay}
                    busy={unmarkPayment.isPending}
                    hidden={balanceHidden}
                    onPrimaryAction={() => handlePrimaryAction(status)}
                    onOpenDetail={() => setDetailFixed(status.fe)}
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
                    <ChevronRight
                      className={cn('size-2.5 shrink-0 transition-transform duration-150', paidExpanded && 'rotate-90')}
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    Pagados ({paidItems.length})
                  </button>
                  {paidExpanded && (
                    <ul>
                      {paidItems.map((status) => (
                        <FixedExpenseRow
                          key={status.fe.id}
                          status={status}
                          categoryColor={categoryById.get(status.fe.category_id ?? '')?.color}
                          vencido={false}
                          busy={unmarkPayment.isPending}
                          hidden={balanceHidden}
                          onPrimaryAction={() => handlePrimaryAction(status)}
                          onOpenDetail={() => setDetailFixed(status.fe)}
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
                            <p className="mt-0.5 text-[12px] text-chalk-faint">
                              Pausado · {fe.is_recurring ? 'bolsa mensual' : `vence el ${fe.due_day}`}
                            </p>
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
            pendingFixedCents={pendingTotalCents}
            unpaidCardsCount={unpaidCardsCount}
            unpaidCardsCents={creditsSummary.totalPendingCents}
            hidden={balanceHidden}
          />

          {pending.length > 0 && (
            <Panel tone="flat">
              <PanelHeader title="Fijos pendientes" hint={`${pending.length} sin abonar este mes`} />
              <ul className="px-6 pb-5">
                {pending.map((status) => (
                  <li key={status.fe.id} className="flex items-center gap-3 border-t border-ink-850 py-2.5 first:border-t-0">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryById.get(status.fe.category_id ?? '')?.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{status.fe.name}</span>
                    {!status.fe.is_recurring && <span className="tnum text-[12px] text-chalk-faint">día {status.fe.due_day}</span>}
                    <Money cents={status.remainingCents} tone="dim" hidden={balanceHidden} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {formOpen && <FixedExpenseFormDialog open={formOpen} onClose={() => setFormOpen(false)} />}
      {markingPaid && (
        <MarkPaidDialog
          open={!!markingPaid}
          onClose={() => setMarkingPaid(null)}
          fixedExpense={markingPaid.fe}
          period={period}
          alreadyPaidCents={markingPaid.paidCents}
        />
      )}
      {detailFixed && (
        <FixedExpenseDetailDialog open={!!detailFixed} onClose={() => setDetailFixed(null)} fixedExpense={detailFixed} />
      )}
    </div>
  )
}
