import { useMemo, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/button-styles'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { useCountUp } from '@/lib/useCountUp'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance, useMonthlySummary, useRecentTransactions } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { CuadrarSaldoDialog } from '@/features/reconciliation/CuadrarSaldoDialog'
import { summarizeCredits } from '@/features/credits/aggregate'
import { useCreditCardPayments, useCreditCardSavings, useCreditCards, useCreditInstallments } from '@/features/credits/api'
import { useFixedExpensePayments, useFixedExpenses, useProjectedBalance } from '@/features/fixed-expenses/api'
import { summarizeFixedExpenses } from '@/features/fixed-expenses/aggregate'
import { Link } from 'react-router'

export function Hoy() {
  const [open, setOpen] = useState(false)
  const [cuadrarOpen, setCuadrarOpen] = useState(false)
  const period = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const balance = useCurrentBalance()
  const summary = useMonthlySummary(period)
  const recent = useRecentTransactions(6)
  const { data: categories } = useCategories(true)
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('saldo-actual')

  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(period)
  const { data: cards } = useCreditCards()
  const { data: installments } = useCreditInstallments(period)
  const { data: savings } = useCreditCardSavings(period)
  const { data: cardPayments } = useCreditCardPayments(period)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const animatedBalance = useCountUp(balance.data ?? 0)
  const creditsSummary = useMemo(
    () => summarizeCredits(cards ?? [], installments ?? [], savings ?? [], cardPayments ?? []),
    [cards, installments, savings, cardPayments],
  )
  // Misma función que Fijos.tsx: así "cuántos fijos faltan pagar" cuenta exactamente igual en las
  // dos pantallas, bolsas a medio gastar incluidas.
  const { pending: pendingFixed, pendingTotalCents: pendingFixedTotal } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], fixedPayments ?? [], new Date(), new Date()),
    [fixedExpenses, fixedPayments],
  )
  const unpaidCardsCount = creditsSummary.perCard.filter((c) => !c.paid).length

  return (
    <div className="flex flex-col gap-12">
      <header>
        <div className="flex items-center gap-2">
          <p className="eyebrow">Saldo actual · {format(new Date(), 'MMMM yyyy', { locale: es })}</p>
          <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="saldo" />
        </div>

        {balance.isPending ? (
          <Skeleton className="mt-4 h-20 w-72 sm:h-28 sm:w-96" />
        ) : (
          <Money cents={animatedBalance} tone="acid" size="hero" className="mt-3 -ml-1" hidden={balanceHidden} />
        )}

        <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6 border-t border-ink-850 pt-6">
          <div>
            <p className="eyebrow">Ingresos del mes</p>
            {summary.isPending ? (
              <Skeleton className="mt-2 h-9 w-28" />
            ) : (
              <Money
                cents={summary.data?.totalIncome ?? 0}
                tone="chalk"
                size="figure"
                className="mt-1"
                hidden={balanceHidden}
              />
            )}
          </div>
          <div>
            <p className="eyebrow">Gastos del mes</p>
            {summary.isPending ? (
              <Skeleton className="mt-2 h-9 w-28" />
            ) : (
              <Money
                cents={summary.data?.totalExpense ?? 0}
                tone="coral"
                size="figure"
                className="mt-1"
                hidden={balanceHidden}
              />
            )}
          </div>
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setCuadrarOpen(true)}>
              Cuadrar saldo
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              icon={<span className="text-base leading-none">+</span>}
              onClick={() => setOpen(true)}
            >
              Nuevo movimiento
            </Button>
          </div>
        </div>
      </header>

      <SaldoProyectadoPanel
        period={period}
        projectedCents={projectedBalance}
        isPending={isProjectedPending}
        currentBalanceCents={balance.data ?? 0}
        pendingFixedCount={pendingFixed.length}
        pendingFixedCents={pendingFixedTotal}
        unpaidCardsCount={unpaidCardsCount}
        unpaidCardsCents={creditsSummary.totalPendingCents}
        hidden={balanceHidden}
        hideWhenNothingPending
      />

      <Panel>
        <PanelHeader
          title="Últimos movimientos"
          action={
            <Link to="/movimientos" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              Ver todos
            </Link>
          }
        />
        {recent.isError ? (
          <ErrorState onRetry={() => recent.refetch()} />
        ) : recent.isPending ? (
          <ul className="flex flex-col gap-1 px-6 pb-5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="size-2 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </li>
            ))}
          </ul>
        ) : recent.data && recent.data.length > 0 ? (
          <ul className="pb-3">
            {recent.data.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} category={categoryById.get(tx.category_id ?? '')} />
            ))}
          </ul>
        ) : (
          <EmptyState
            glyph="∅"
            title="Todavía no cargaste nada"
            hint="Arrancá con tu primer ingreso o gasto del día."
            action={<Button onClick={() => setOpen(true)}>Nuevo movimiento</Button>}
          />
        )}
      </Panel>

      {/* Montado sólo mientras está abierto: así cada apertura dispara una consulta fresca de
          categorías, en vez de quedar pegado al resultado de la primera vez que se montó Hoy. */}
      {open && <TransactionFormDialog open={open} onClose={() => setOpen(false)} />}
      {cuadrarOpen && <CuadrarSaldoDialog open={cuadrarOpen} onClose={() => setCuadrarOpen(false)} />}
    </div>
  )
}
