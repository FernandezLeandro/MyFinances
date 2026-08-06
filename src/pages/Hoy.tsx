import { useMemo, useState } from 'react'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { TransactionRow } from '@/components/TransactionRow'
import { useCountUp } from '@/lib/useCountUp'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance, useMonthlySummary, useRecentTransactions } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { Link } from 'react-router'

export function Hoy() {
  const [open, setOpen] = useState(false)
  const period = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const { data: balanceCents } = useCurrentBalance()
  const { data: summary } = useMonthlySummary(period)
  const { data: recent } = useRecentTransactions(6)
  const { data: categories } = useCategories(true)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const animatedBalance = useCountUp(balanceCents ?? 0)

  return (
    <div className="flex flex-col gap-12">
      <header>
        <p className="eyebrow">Saldo actual · {format(new Date(), 'MMMM yyyy', { locale: es })}</p>
        <Money cents={animatedBalance} tone="acid" size="hero" className="mt-3 -ml-1" />

        <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6 border-t border-ink-850 pt-6">
          <div>
            <p className="eyebrow">Ingresos del mes</p>
            <Money cents={summary?.totalIncome ?? 0} tone="chalk" size="figure" className="mt-1" />
          </div>
          <div>
            <p className="eyebrow">Gastos del mes</p>
            <Money cents={summary?.totalExpense ?? 0} tone="coral" size="figure" className="mt-1" />
          </div>
          <Button
            className="ml-auto w-full sm:w-auto"
            icon={<span className="text-base leading-none">+</span>}
            onClick={() => setOpen(true)}
          >
            Nuevo movimiento
          </Button>
        </div>
      </header>

      <Panel>
        <PanelHeader
          title="Últimos movimientos"
          action={
            <Link to="/movimientos" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              Ver todos
            </Link>
          }
        />
        {recent && recent.length > 0 ? (
          <ul className="pb-3">
            {recent.map((tx) => (
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
    </div>
  )
}
