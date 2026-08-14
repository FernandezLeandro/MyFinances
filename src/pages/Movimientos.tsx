import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { addMonths, format, parseISO, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { useCategories } from '@/features/categories/api'
import { CategoryManagerDialog } from '@/features/categories/CategoryManagerDialog'
import { TRANSACTIONS_ROW_LIMIT, useTransactions, type Transaction } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { TransactionFiltersDialog, type MovementFilters } from '@/features/transactions/TransactionFiltersDialog'
import {
  MOVEMENT_PERIOD_PRESET_LABELS,
  defaultMovementPeriod,
  periodLabel,
  periodRange,
} from '@/features/transactions/movementPeriod'
import { centsToNumeric } from '@/lib/money'
import { downloadCsv } from '@/lib/csv'

export function Movimientos() {
  // Llega acá desde el drill-down de Análisis con una categoría pre-elegida.
  const location = useLocation()
  const incomingCategoryId = (location.state as { categoryId?: string } | null)?.categoryId ?? null

  const [filters, setFilters] = useState<MovementFilters>(() => ({
    period: defaultMovementPeriod(),
    type: 'all',
    categoryIds: incomingCategoryId ? [incomingCategoryId] : [],
  }))
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const { from, to } = useMemo(() => periodRange(filters.period), [filters.period])
  const categoryIds = useMemo(() => [...filters.categoryIds].sort(), [filters.categoryIds])

  const { data: transactions, isPending, isError, refetch } = useTransactions({
    from,
    to,
    type: filters.type === 'all' ? undefined : filters.type,
    categoryIds,
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

  function handleExport() {
    if (!transactions || transactions.length === 0) return
    const rows = [
      ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Importe'],
      ...transactions.map((tx) => [
        tx.occurred_on,
        tx.type === 'income' ? 'Ingreso' : 'Gasto',
        categoryById.get(tx.category_id ?? '')?.name ?? '',
        tx.description ?? '',
        centsToNumeric(tx.type === 'income' ? tx.cents : -tx.cents),
      ]),
    ]
    const filename =
      filters.period.preset === 'month'
        ? `movimientos-${filters.period.anchor.slice(0, 7)}.csv`
        : `movimientos-${from}_${to}.csv`
    downloadCsv(filename, rows)
  }

  function shiftMonth(delta: number) {
    setFilters((f) => ({
      ...f,
      period: {
        ...f.period,
        anchor: format(
          delta > 0 ? addMonths(parseISO(f.period.anchor), delta) : subMonths(parseISO(f.period.anchor), -delta),
          'yyyy-MM-dd',
        ),
      },
    }))
  }

  function clearAll() {
    setFilters({ period: defaultMovementPeriod(), type: 'all', categoryIds: [] })
    setSearchInput('')
  }

  const activeCount =
    (filters.period.preset !== 'month' ? 1 : 0) + (filters.type !== 'all' ? 1 : 0) + filters.categoryIds.length
  const hasFilters = activeCount > 0 || search !== ''

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {filters.period.preset === 'month' ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Mes anterior"
                className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
              >
                <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
              <p className="eyebrow">{format(parseISO(filters.period.anchor), 'MMMM yyyy', { locale: es })}</p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Mes siguiente"
                className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
              >
                <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          ) : (
            <p className="eyebrow">{periodLabel(filters.period)}</p>
          )}
          <h1 className="mt-2 font-display text-figure font-semibold">Movimientos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!transactions?.length}>
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            Categorías
          </Button>
          <Button icon={<span className="text-base leading-none">+</span>} onClick={openNew}>
            Nuevo movimiento
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por descripción…"
            className="h-9 max-w-[220px] text-[13px]"
          />
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} className="gap-1.5">
            <SlidersHorizontal className="size-3.5" strokeWidth={1.4} aria-hidden />
            Filtros
            {activeCount > 0 && (
              <span
                aria-hidden
                className="ml-0.5 grid size-4 place-items-center rounded-full bg-acid text-[11px] font-semibold text-ink-950"
              >
                {activeCount}
              </span>
            )}
          </Button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Limpiar todo
            </Button>
          )}
        </div>

        {activeCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {filters.period.preset !== 'month' && (
              <Chip
                ariaLabel={`Quitar filtro de período: ${MOVEMENT_PERIOD_PRESET_LABELS[filters.period.preset]}`}
                onClick={() => setFilters((f) => ({ ...f, period: defaultMovementPeriod() }))}
              >
                {filters.period.preset === 'custom' ? periodLabel(filters.period) : MOVEMENT_PERIOD_PRESET_LABELS[filters.period.preset]}{' '}
                <span aria-hidden className="text-chalk-faint">
                  ✕
                </span>
              </Chip>
            )}
            {filters.type !== 'all' && (
              <Chip
                ariaLabel={`Quitar filtro de tipo: ${filters.type === 'income' ? 'Ingresos' : 'Gastos'}`}
                onClick={() => setFilters((f) => ({ ...f, type: 'all' }))}
              >
                {filters.type === 'income' ? 'Ingresos' : 'Gastos'}{' '}
                <span aria-hidden className="text-chalk-faint">
                  ✕
                </span>
              </Chip>
            )}
            {filters.categoryIds.map((id) => {
              const category = categoryById.get(id)
              return (
                <Chip
                  key={id}
                  color={category?.color}
                  ariaLabel={`Quitar filtro de categoría: ${category?.name ?? 'categoría'}`}
                  onClick={() => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((c) => c !== id) }))}
                >
                  {category?.name ?? 'Categoría'} <span aria-hidden className="text-chalk-faint">✕</span>
                </Chip>
              )
            })}
          </div>
        )}
      </div>

      {isError ? (
        <Panel>
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <Panel>
          <ul className="flex flex-col gap-1 px-6 py-5">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-2 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
              </li>
            ))}
          </ul>
        </Panel>
      ) : byDay.length === 0 ? (
        <Panel>
          <EmptyState
            glyph="∅"
            title={hasFilters ? 'No hay movimientos con esos filtros' : 'Nada cargado en este período'}
            hint={hasFilters ? 'Probá sacando algún filtro.' : 'Cargá tu primer movimiento.'}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
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
          {transactions?.length === TRANSACTIONS_ROW_LIMIT && (
            <p className="text-[12px] text-chalk-faint">
              Mostrando los primeros {TRANSACTIONS_ROW_LIMIT} movimientos — acotá el período.
            </p>
          )}
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
      {filtersOpen && (
        <TransactionFiltersDialog
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          value={filters}
          onApply={setFilters}
          categories={categories ?? []}
        />
      )}
    </div>
  )
}
