import { useMemo, useState } from 'react'
import { format, isSameDay, parseISO, startOfMonth, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { EyeToggle } from '@/components/ui/EyeToggle'
import { Money } from '@/components/ui/Money'
import { Stat, StatRow } from '@/components/ui/Stat'
import { StackedBar } from '@/components/ui/StackedBar'
import { KeyValueRow } from '@/components/ui/KeyValueRow'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { useCountUp } from '@/lib/useCountUp'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance, useMonthlySummary, useRecentTransactions, type Transaction } from '@/features/transactions/api'
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
import { summarizeFixedExpenses } from '@/features/fixed-expenses/aggregate'
import { useSavingsBuckets, useSavingsEntries } from '@/features/savings/api'
import { summarizePortfolio } from '@/features/savings/aggregate'
import { NetAmount } from '@/features/savings/NetAmount'
import { useAssets } from '@/features/assets/api'
import { useAssetPrices } from '@/features/fx/api'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { summarizeReceivables } from '@/features/receivables/aggregate'

/** "Hoy" / "Ayer" / el nombre del día — Movimientos agrupa por fecha exacta porque ahí importa
 *  ubicarse en el calendario; acá alcanza con lo reciente, así el teaser de 6 movimientos no repite
 *  la fecha completa en cada fila. */
function dayLabel(occurredOn: string, today: Date): string {
  const date = parseISO(occurredOn)
  if (isSameDay(date, today)) return 'Hoy'
  if (isSameDay(date, subDays(today, 1))) return 'Ayer'
  return format(date, "EEEE d 'de' MMMM", { locale: es })
}

export function Hoy() {
  const [open, setOpen] = useState(false)
  const [cuadrarOpen, setCuadrarOpen] = useState(false)
  const period = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const balance = useCurrentBalance()
  const summary = useMonthlySummary(period)
  const recent = useRecentTransactions(6)
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('saldo-actual')

  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(period)
  const { data: cards } = useCreditCards()
  const { data: standalonePurchases } = useStandalonePurchases()
  const { data: installments } = useCreditInstallments(period)
  const { data: savings } = useCreditCardSavings(period)
  const { data: cardPayments } = useCreditCardPayments(period)
  const { data: purchasePayments } = useCreditPurchasePayments(period)

  // Teaser de Ahorros: mismos datos y misma cuenta que la pantalla completa (`summarizePortfolio`),
  // así el total de acá nunca puede desincronizarse del de Ahorros.
  const { data: buckets, isPending: isBucketsPending } = useSavingsBuckets()
  const { data: entries, isPending: isEntriesPending } = useSavingsEntries()
  const { data: assets, isPending: isAssetsPending } = useAssets()
  const prices = useAssetPrices()
  const { data: receivables } = useReceivables()
  const { data: receivablePayments } = useReceivablePayments()

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
  // Misma función que Fijos.tsx: así "cuántos fijos faltan pagar" cuenta exactamente igual en las
  // dos pantallas, bolsas a medio gastar incluidas.
  const { pending: pendingFixed, pendingTotalCents: pendingFixedTotal } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], fixedPayments ?? [], new Date(), new Date()),
    [fixedExpenses, fixedPayments],
  )
  const unpaidDebtsCount =
    misDeudasSummary.perCard.filter((c) => !c.paid).length + misDeudasSummary.standalone.filter((s) => !s.paid).length

  const isSavingsPending = isBucketsPending || isEntriesPending || isAssetsPending
  const portfolio = useMemo(
    () => summarizePortfolio(buckets ?? [], entries ?? [], assets ?? [], prices),
    [buckets, entries, assets, prices],
  )
  const assetById = useMemo(() => new Map((assets ?? []).map((a) => [a.id, a])), [assets])
  const teaserBuckets = portfolio.perBucket.filter((b) => b.bucket.include_in_total)
  const receivablesSummary = useMemo(
    () => summarizeReceivables(receivables ?? [], receivablePayments ?? [], new Date()),
    [receivables, receivablePayments],
  )

  const groupedRecent = useMemo(() => {
    const today = new Date()
    const groups = new Map<string, Transaction[]>()
    for (const tx of recent.data ?? []) {
      const label = dayLabel(tx.occurred_on, today)
      const list = groups.get(label) ?? []
      list.push(tx)
      groups.set(label, list)
    }
    return [...groups.entries()]
  }, [recent.data])

  const totalIncome = summary.data?.totalIncome ?? 0
  const totalExpense = summary.data?.totalExpense ?? 0
  const totalFlow = totalIncome + totalExpense
  const incomePct = totalFlow > 0 ? (totalIncome / totalFlow) * 100 : 0
  const expensePct = totalFlow > 0 ? (totalExpense / totalFlow) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr_1fr] lg:grid-rows-[auto_auto]">
      {/* Saldo actual */}
      <Panel className="flex flex-col p-7 lg:row-span-2">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Saldo actual</p>
          <EyeToggle hidden={balanceHidden} onToggle={toggleBalanceHidden} label="saldo" />
        </div>

        {balance.isPending ? (
          <Skeleton className="mt-4 h-16 w-64" />
        ) : (
          <Money cents={animatedBalance} tone="acid" size="hero" className="mt-3 -ml-1" hidden={balanceHidden} />
        )}

        <div className="mt-7 border-t border-divider pt-6">
          <p className="eyebrow">Flujo del mes</p>
          {summary.isPending ? (
            <Skeleton className="mt-3 h-3 w-full" />
          ) : (
            <StackedBar
              className="mt-3"
              segments={[
                { pct: incomePct, color: 'var(--color-accent)' },
                { pct: expensePct, color: 'var(--color-negative)' },
              ]}
            />
          )}
          <StatRow className="mt-3.5">
            <Stat label="Ingresos">
              {summary.isPending ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <Money cents={totalIncome} tone="chalk" size="figure" hidden={balanceHidden} />
              )}
            </Stat>
            <Stat label="Gastos">
              {summary.isPending ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <Money cents={totalExpense} tone="coral" size="figure" hidden={balanceHidden} />
              )}
            </Stat>
          </StatRow>
        </div>

        {/* Apilados full-width en mobile (nunca se desbordan) y repartiéndose el ancho disponible
            50/50 de `sm:` para arriba — así "Cuadrar saldo" no queda pegado a la izquierda con
            aire libre a la derecha. */}
        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
          <Button
            className="w-full sm:flex-1"
            icon={<span className="text-base leading-none">+</span>}
            onClick={() => setOpen(true)}
          >
            Nuevo movimiento
          </Button>
          <Button variant="outline" className="w-full sm:flex-1" onClick={() => setCuadrarOpen(true)}>
            Cuadrar saldo
          </Button>
        </div>
      </Panel>

      {/* Proyectado a fin de mes */}
      <SaldoProyectadoPanel
        projectedCents={projectedBalance}
        isPending={isProjectedPending}
        currentBalanceCents={balance.data ?? 0}
        pendingFixedCount={pendingFixed.length}
        pendingFixedCents={pendingFixedTotal}
        unpaidDebtsCount={unpaidDebtsCount}
        unpaidDebtsCents={misDeudasSummary.totalPendingCents}
        hidden={balanceHidden}
        hideWhenNothingPending
      />

      {/* Ahorros — se omite en mobile, igual que en el mockup: no entra sin apretar el resto. */}
      <Panel className="hidden flex-col p-6 lg:flex">
        <p className="eyebrow">Ahorros</p>
        {isSavingsPending ? (
          <Skeleton className="mt-2 h-8 w-32" />
        ) : portfolio.totalValueCents == null ? (
          <p className="mt-2 text-[13px] text-fg-muted">Cotización no disponible</p>
        ) : (
          <Money cents={portfolio.totalValueCents} tone="chalk" size="figure" className="mt-2" hidden={balanceHidden} />
        )}

        <dl className="mt-4 flex flex-col gap-2.5 text-[12.5px]">
          {teaserBuckets.map((b) => {
            const net = b.nets.find((n) => n.quantityUnits !== 0)
            const asset = net ? assetById.get(net.assetId) : undefined
            return (
              <KeyValueRow key={b.bucket.id} label={<span className="text-fg-secondary">{b.bucket.name}</span>}>
                {net && asset ? (
                  <NetAmount net={net} asset={asset} tone="chalk" hidden={balanceHidden} />
                ) : (
                  <Money cents={b.valueCents ?? 0} tone="chalk" hidden={balanceHidden} />
                )}
              </KeyValueRow>
            )
          })}
          <KeyValueRow label={<span className="text-fg-secondary">Me deben</span>} divider>
            <Money cents={receivablesSummary.totalPendingCents} tone="chalk" hidden={balanceHidden} />
          </KeyValueRow>
        </dl>
      </Panel>

      {/* Últimos movimientos */}
      <Panel className="flex flex-col lg:col-span-2">
        <CardHeader
          title="Últimos movimientos"
          action={
            <Link to="/movimientos" className="text-[13px] font-semibold text-accent-text">
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
          <div className="flex flex-col gap-1 pb-4">
            {groupedRecent.map(([label, txs]) => (
              <div key={label}>
                <GroupHeader label={label} className="px-6 pt-2.5 pb-1" />
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
