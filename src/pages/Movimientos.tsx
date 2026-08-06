import { useEffect, useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { TransactionRow } from '@/components/TransactionRow'
import { useCategories } from '@/features/categories/api'
import { CategoryManagerDialog } from '@/features/categories/CategoryManagerDialog'
import { useTransactions, type Transaction, type TransactionType } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'

type Filter = 'all' | TransactionType

export function Movimientos() {
  const [month, setMonth] = useState(() => new Date())
  const [filter, setFilter] = useState<Filter>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const from = format(startOfMonth(month), 'yyyy-MM-dd')
  const to = format(endOfMonth(month), 'yyyy-MM-dd')

  const { data: transactions } = useTransactions({
    from,
    to,
    type: filter === 'all' ? undefined : filter,
    categoryId: categoryId ?? undefined,
    text: search || undefined,
  })
  const { data: categories } = useCategories(true)

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const byDay = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of transactions ?? []) {
      const list = groups.get(tx.occurred_on) ?? []
      list.push(tx)
      groups.set(tx.occurred_on, list)
    }
    return [...groups.entries()]
  }, [transactions])

  function openNew() {
    setEditingTx(null)
    setFormOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx)
    setFormOpen(true)
  }

  const hasFilters = filter !== 'all' || categoryId !== null || search !== ''

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
          <h1 className="mt-2 font-display text-figure font-semibold">Movimientos</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            Categorías
          </Button>
          <Button icon={<span className="text-base leading-none">+</span>} onClick={openNew}>
            Nuevo movimiento
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por descripción…"
          className="h-9 max-w-[220px] text-[13px]"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            Todos
          </Chip>
          <Chip active={filter === 'income'} onClick={() => setFilter('income')}>
            Ingresos
          </Chip>
          <Chip active={filter === 'expense'} onClick={() => setFilter('expense')}>
            Gastos
          </Chip>
          <span aria-hidden className="mx-1.5 w-px bg-ink-800" />
          {(categories ?? [])
            .filter((c) => !c.is_archived)
            .map((category) => (
              <Chip
                key={category.id}
                color={category.color}
                active={categoryId === category.id}
                onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
              >
                {category.name}
              </Chip>
            ))}
        </div>
      </div>

      {!transactions || byDay.length === 0 ? (
        <Panel>
          <EmptyState
            glyph="∅"
            title={hasFilters ? 'No hay movimientos con esos filtros' : 'Nada cargado este mes'}
            hint={hasFilters ? 'Probá sacando algún filtro.' : 'Cargá tu primer movimiento del mes.'}
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilter('all')
                    setCategoryId(null)
                    setSearchInput('')
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : (
                <Button onClick={openNew}>Nuevo movimiento</Button>
              )
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map(([day, items]) => {
            const total = items.reduce((acc, t) => acc + (t.type === 'income' ? t.cents : -t.cents), 0)
            return (
              <Panel key={day}>
                <div className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-1">
                  <h2 className="eyebrow">{format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}</h2>
                  <Money cents={total} tone={total >= 0 ? 'dim' : 'coral'} signed />
                </div>
                <ul className="pb-3">
                  {items.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      category={categoryById.get(tx.category_id ?? '')}
                      onClick={() => openEdit(tx)}
                    />
                  ))}
                </ul>
              </Panel>
            )
          })}
        </div>
      )}

      {formOpen && (
        <TransactionFormDialog open={formOpen} onClose={() => setFormOpen(false)} transaction={editingTx} />
      )}
      {categoriesOpen && <CategoryManagerDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />}
    </div>
  )
}
