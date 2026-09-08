import { lazy, Suspense, useMemo, useState } from 'react'
import { endOfMonth, format, isSameDay, parseISO, startOfMonth, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { Money } from '@/components/ui/Money'
import { Stat, StatRow } from '@/components/ui/Stat'
import { StackedBar } from '@/components/ui/StackedBar'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { useCountUp } from '@/lib/useCountUp'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCategories } from '@/features/categories/api'
import {
  useCurrentBalance,
  useMonthlySummary,
  useSpendByCategory,
  useTransactions,
  type Transaction,
} from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { CuadrarSaldoDialog } from '@/features/reconciliation/CuadrarSaldoDialog'
import { useBalanceLocations } from '@/features/reconciliation/api'
import { summarizeMisDeudas } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallments,
  useCreditPurchasePayments,
  useStandalonePurchases,
} from '@/features/credits/api'
import { useFixedExpensePayments, useFixedExpenses, useProjectedBalance } from '@/features/fixed-expenses/api'
import { fixedExpenseUrgency, summarizeFixedExpenses, type FixedExpenseUrgency } from '@/features/fixed-expenses/aggregate'

// `lazy`, no import estático: `CategoryDonut` arrastra recharts, y Hoy es la única ruta eager de
// la app (ver el comentario de `App.tsx`) — cargarlo de arriba le sumaba ~300kB gzip al bundle
// inicial que paga cualquiera que abra la app, incluso sin llegar a mirar el donut.
const CategoryDonut = lazy(() =>
  import('@/features/analytics/CategoryDonut').then((m) => ({ default: m.CategoryDonut })),
)

/** "Hoy" / "Ayer" / el nombre del día — alcanza con lo reciente, así la lista no repite la fecha
 *  completa en cada fila. */
function dayLabel(occurredOn: string, today: Date): string {
  const date = parseISO(occurredOn)
  if (isSameDay(date, today)) return 'Hoy'
  if (isSameDay(date, subDays(today, 1))) return 'Ayer'
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}

const urgencyBadgeVariant: Record<FixedExpenseUrgency, 'red' | 'amber' | 'neutral'> = {
  red: 'red',
  amber: 'amber',
  neutral: 'neutral',
}

const urgencyDotClass: Record<FixedExpenseUrgency, string> = {
  red: 'bg-negative',
  amber: 'bg-badge-amber-fg',
  neutral: 'bg-border-strong',
}

function urgencyTag(dueDay: number, urgency: FixedExpenseUrgency): string {
  if (urgency === 'red') return 'Venció'
  if (urgency === 'amber') return 'Esta semana'
  return `Vence el ${dueDay}`
}

export function Hoy() {
  const [open, setOpen] = useState(false)
  const [cuadrarOpen, setCuadrarOpen] = useState(false)
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const balance = useCurrentBalance()
  const summary = useMonthlySummary(monthStart)
  const monthTransactions = useTransactions({ from: monthStart, to: monthEnd })
  const spendQuery = useSpendByCategory(monthStart, monthEnd)
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('saldo-actual')

  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(monthStart)
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(monthStart)
  const { data: cards } = useCreditCards()
  const { data: standalonePurchases } = useStandalonePurchases()
  const { data: installments } = useCreditInstallments(monthStart)
  const { data: savings } = useCreditCardSavings(monthStart)
  const { data: cardPayments } = useCreditCardPayments(monthStart)
  const { data: purchasePayments } = useCreditPurchasePayments(monthStart)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const accountById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations])
  const animatedBalance = useCountUp(balance.data ?? 0)
  const misDeudasSummary = useMemo(
    () =>
      summarizeMisDeudas(
        cards ?? [],
        standalonePurchases ?? [],
        installments ?? [],
        savings ?? [],
        cardPayments ?? [],
        purchasePayments ?? [],
      ),
    [cards, standalonePurchases, installments, savings, cardPayments, purchasePayments],
  )
  const unpaidCards = misDeudasSummary.perCard.filter((c) => !c.paid)
  const unpaidStandalone = misDeudasSummary.standalone.filter((s) => !s.paid)
  const unpaidDebtsCount = unpaidCards.length + unpaidStandalone.length

  const { pending: pendingFixed, pendingTotalCents: pendingFixedTotal } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], fixedPayments ?? [], today, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` es estable dentro del render
    [fixedExpenses, fixedPayments],
  )

  // Sólo lo que realmente "vence" — una bolsa mensual no tiene día de vencimiento, así que no
  // compite acá con los fijos de una sola vez (ver `fixedExpenseUrgency`).
  const upcoming = useMemo(
    () =>
      pendingFixed
        .filter((s) => s.fe.due_day != null)
        .sort((a, b) => (a.fe.due_day ?? 0) - (b.fe.due_day ?? 0))
        .slice(0, 4),
    [pendingFixed],
  )

  const currentBalanceCents = balance.data ?? 0

  // "Comprometido" = lo mismo que resta el saldo proyectado (fijos + deudas pendientes) — la barra
  // de la tarjeta oscura de mobile nunca puede desincronizarse del número que muestra arriba.
  const committedCents = pendingFixedTotal + misDeudasSummary.totalPendingCents
  const committedPct = currentBalanceCents > 0 ? Math.min((committedCents / currentBalanceCents) * 100, 100) : 0
  const freePct = 100 - committedPct

  const groupedRecent = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of monthTransactions.data ?? []) {
      const label = dayLabel(tx.occurred_on, today)
      const list = groups.get(label) ?? []
      list.push(tx)
      groups.set(label, list)
    }
    return [...groups.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` es estable dentro del render
  }, [monthTransactions.data])

  const totalIncome = summary.data?.totalIncome ?? 0
  const totalExpense = summary.data?.totalExpense ?? 0
  const totalFlow = totalIncome + totalExpense
  const incomePct = totalFlow > 0 ? (totalIncome / totalFlow) * 100 : 0
  const expensePct = totalFlow > 0 ? (totalExpense / totalFlow) * 100 : 0

  const monthLabel = format(today, 'MMMM', { locale: es })
  const spend = spendQuery.data ?? []
  const spendTotal = spend.reduce((acc, s) => acc + s.cents, 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Saldo actual — la única cifra que contesta "cuánto me queda para gastar". */}
      <Panel className="flex flex-col gap-6 p-6 lg:flex-row lg:flex-wrap lg:items-end lg:gap-x-11 lg:gap-y-5 lg:p-7">
        <div className="flex-none">
          <div className="flex items-center gap-2">
            <p className="eyebrow">Saldo actual</p>
            <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="saldo" />
          </div>
          {balance.isPending ? (
            <Skeleton className="mt-3 h-12 w-56 lg:h-16 lg:w-64" />
          ) : (
            <Money cents={animatedBalance} tone="accent" size="hero" className="mt-2 -ml-1 lg:mt-3" hidden={balanceHidden} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="eyebrow lg:hidden">Flujo del mes</p>
          {summary.isPending ? (
            <Skeleton className="mt-3 h-3 w-full" />
          ) : (
            <StackedBar
              className="mt-2 lg:mt-0"
              segments={[
                { pct: incomePct, color: 'var(--color-accent)' },
                { pct: expensePct, color: 'var(--color-negative)' },
              ]}
            />
          )}
          <StatRow className="mt-3.5 gap-6 lg:gap-8">
            <Stat label="Ingresos">
              {summary.isPending ? (
                <Skeleton className="h-6 w-20 lg:h-7 lg:w-24" />
              ) : (
                <Money cents={totalIncome} tone="fg" size="figure" hidden={balanceHidden} />
              )}
            </Stat>
            <Stat label="Gastos">
              {summary.isPending ? (
                <Skeleton className="h-6 w-20 lg:h-7 lg:w-24" />
              ) : (
                <Money cents={totalExpense} tone="negative" size="figure" hidden={balanceHidden} />
              )}
            </Stat>
          </StatRow>
        </div>

        {/* Sólo escritorio — en mobile el `+` de la isla ya cubre "nuevo movimiento", y duplicar el
            CTA acá no aporta (ver la nota de "Cuadrar saldo" en mobile en el reporte del bloque). */}
        <div className="hidden flex-none flex-col gap-2 lg:flex lg:ml-auto lg:w-[186px]">
          <Button onClick={() => setOpen(true)}>+ Nuevo movimiento</Button>
          <Button variant="outline" onClick={() => setCuadrarOpen(true)}>
            Cuadrar saldo
          </Button>
        </div>
      </Panel>

      {/* Proyectado · En qué se fue el mes · Vencimientos — desktop, tres tarjetas iguales. */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-3">
        <SaldoProyectadoPanel
          title="Proyectado a fin de mes"
          projectedCents={projectedBalance}
          isPending={isProjectedPending}
          currentBalanceCents={currentBalanceCents}
          pendingFixedCount={pendingFixed.length}
          pendingFixedCents={pendingFixedTotal}
          unpaidDebtsCount={unpaidDebtsCount}
          unpaidDebtsCents={misDeudasSummary.totalPendingCents}
          hidden={balanceHidden}
        />

        <Panel className="p-[22px]">
          <p className="eyebrow">En qué se fue el mes</p>
          {spendQuery.isError ? (
            <ErrorState onRetry={() => spendQuery.refetch()} className="mt-3" />
          ) : spendQuery.isPending ? (
            <div className="mt-3.5 flex items-center gap-4">
              <Skeleton className="size-[86px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </div>
          ) : spend.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-fg-muted">Todavía no cargaste gastos este mes.</p>
          ) : (
            <div className="mt-3.5 flex items-center gap-4">
              <Suspense fallback={<Skeleton className="size-[86px] shrink-0 rounded-full" />}>
                <CategoryDonut data={spend} size={86} />
              </Suspense>
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {spend.slice(0, 4).map((s) => (
                  <li key={s.categoryId} className="flex items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{s.categoryName}</span>
                    <span className="tnum text-[12px] font-semibold text-fg-secondary">
                      {spendTotal > 0 ? Math.round((s.cents / spendTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="p-[22px]">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Vencimientos</p>
            <Link to="/fijos" className="text-[12px] font-semibold text-accent-text">
              Ver fijos
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-[13px] text-fg-muted">No tenés fijos por vencer.</p>
          ) : (
            <ul className="mt-2.5 flex flex-col">
              {upcoming.map((status) => {
                const dueDay = status.fe.due_day as number
                const urgency = fixedExpenseUrgency(dueDay, today)
                return (
                  <li key={status.fe.id} className="flex items-center gap-2.5 py-1.5">
                    <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${urgencyDotClass[urgency]}`} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{status.fe.name}</span>
                    <Badge variant={urgencyBadgeVariant[urgency]}>{urgencyTag(dueDay, urgency)}</Badge>
                    <Money cents={status.remainingCents} tone="fg" size="row" hidden={balanceHidden} />
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Libre después de compromisos (con proyectado al pie) · Próximos vencimientos — mobile.
          Sin "de $saldo actual" al lado de la cifra: ese número ya está en el hero de arriba. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <Panel tone="inverse" className="p-[18px]">
          <p className="eyebrow" style={{ color: 'var(--color-on-inverse-muted)' }}>
            Libre después de compromisos
          </p>
          {isProjectedPending ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <Money cents={projectedBalance ?? 0} tone="onInverse" size="figure" className="mt-1" hidden={balanceHidden} />
          )}
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-pill bg-inverse-divider">
            <div className="h-full bg-negative-on-inverse" style={{ width: `${committedPct}%` }} />
            <div className="h-full bg-accent-text" style={{ width: `${freePct}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-[12.5px]">
            <span className="text-on-inverse-secondary">Proyectado a fin de mes</span>
            <Money cents={projectedBalance ?? 0} tone="onInverse" hidden={balanceHidden} />
          </div>
        </Panel>

        <Panel className="p-[18px]">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Próximos vencimientos</p>
            <Link to="/fijos" className="text-[11.5px] font-semibold text-accent-text">
              Ver todos
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-[13px] text-fg-muted">No tenés fijos por vencer.</p>
          ) : (
            <ul className="mt-2.5 flex flex-col">
              {upcoming.map((status) => {
                const dueDay = status.fe.due_day as number
                const urgency = fixedExpenseUrgency(dueDay, today)
                return (
                  <li key={status.fe.id} className="flex items-center gap-2.5 py-1.5">
                    <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${urgencyDotClass[urgency]}`} />
                    <span className="text-[13px] font-semibold text-fg">{status.fe.name}</span>
                    <Badge variant={urgencyBadgeVariant[urgency]}>{urgencyTag(dueDay, urgency)}</Badge>
                    <Money cents={status.remainingCents} tone="fg" size="row" className="ml-auto" hidden={balanceHidden} />
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Movimientos del mes · rail derecho (Libre + Mis deudas, sólo escritorio). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr] lg:items-start">
        <Panel className="flex flex-col p-[22px]">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold text-fg">
              Movimientos de {monthLabel}
            </h2>
            <Link to="/movimientos" className="text-[12px] font-semibold text-accent-text">
              Ver todos
            </Link>
          </div>

          {monthTransactions.isError ? (
            <ErrorState onRetry={() => monthTransactions.refetch()} className="mt-4" />
          ) : monthTransactions.isPending ? (
            <ul className="mt-4 flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </li>
              ))}
            </ul>
          ) : groupedRecent.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1">
              {groupedRecent.map(([label, txs]) => (
                <div key={label}>
                  <GroupHeader label={label} className="pt-2 pb-1" />
                  <ul>
                    {txs.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        category={categoryById.get(tx.category_id ?? '')}
                        account={accountById.get(tx.account_id ?? '')}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              glyph="∅"
              title="Todavía no cargaste nada este mes"
              hint="Arrancá con tu primer ingreso o gasto del día."
              action={<Button onClick={() => setOpen(true)}>Nuevo movimiento</Button>}
              className="mt-4"
            />
          )}
        </Panel>

        <div className="hidden flex-col gap-4 lg:flex">
          {(unpaidCards.length > 0 || unpaidStandalone.length > 0) && (
            <Panel className="p-[22px]">
              <div className="flex items-baseline justify-between">
                <p className="eyebrow">Mis deudas</p>
                <Money cents={misDeudasSummary.totalPendingCents} tone="fg" size="row" hidden={balanceHidden} />
              </div>
              <ul className="mt-3 flex flex-col gap-2.5">
                {unpaidCards.map((c) => (
                  <li key={c.card.id} className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">{c.card.name}</span>
                    <span className="text-[11.5px] text-fg-muted">
                      {c.items.length} cuota{c.items.length === 1 ? '' : 's'}
                    </span>
                    <Money cents={c.totalCents} tone="fg" size="row" hidden={balanceHidden} />
                  </li>
                ))}
                {unpaidStandalone.map((s) => (
                  <li key={s.purchase.id} className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-fg">
                      {s.purchase.description}
                    </span>
                    <Money cents={s.totalCents} tone="fg" size="row" hidden={balanceHidden} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {/* Montado sólo mientras está abierto: así cada apertura dispara una consulta fresca de
          categorías, en vez de quedar pegado al resultado de la primera vez que se montó Hoy. */}
      {open && <TransactionFormDialog open={open} onClose={() => setOpen(false)} />}
      {cuadrarOpen && <CuadrarSaldoDialog open={cuadrarOpen} onClose={() => setCuadrarOpen(false)} />}
    </div>
  )
}
