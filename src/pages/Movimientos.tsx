import { useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { SlidersHorizontal } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { MonthNav } from '@/components/ui/MonthNav'
import { Button } from '@/components/ui/Button'
import { FilterChip } from '@/components/ui/Chip'
import { SearchInput } from '@/components/ui/SearchInput'
import { CountBubble } from '@/components/ui/CountBubble'
import { Money } from '@/components/ui/Money'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { useCategories } from '@/features/categories/api'
import { CategoryManagerDialog } from '@/features/categories/CategoryManagerDialog'
import { useBalanceLocations } from '@/features/reconciliation/api'
import { TRANSACTIONS_ROW_LIMIT, UNASSIGNED_ACCOUNT_ID, useTransactions, type Transaction } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { TransactionFiltersDialog } from '@/features/transactions/TransactionFiltersDialog'
import { useMovimientosFilters } from '@/features/transactions/useMovimientosFilters'
import {
  MOVEMENT_PERIOD_PRESET_LABELS,
  defaultMovementPeriod,
  periodLabel,
  type MovementPeriod,
} from '@/features/transactions/movementPeriod'

export function Movimientos() {
  // Llega acá desde el drill-down de Análisis (categoría + período) o desde el "ver" de "Sin
  // asignar" en Cuadrar Saldo (el filtro de cuenta en sí, con un período bien amplio para no
  // limitarlo al mes actual).
  const location = useLocation()
  const incoming = location.state as { categoryId?: string; period?: MovementPeriod; accountIds?: string[] } | null

  const {
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    search,
    from,
    to,
    categoryIds,
    accountIds,
    shiftMonth,
    clearAll,
    exportCsv,
    activeCount,
    hasFilters,
  } = useMovimientosFilters({
    initialPeriod: incoming?.period,
    initialCategoryId: incoming?.categoryId,
    initialAccountIds: incoming?.accountIds,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  const { data: transactions, isPending, isError, refetch } = useTransactions({
    from,
    to,
    type: filters.type === 'all' ? undefined : filters.type,
    categoryIds,
    accountIds,
    text: search || undefined,
  })
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const accountById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations])

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {filters.period.preset === 'month' ? (
            <MonthNav
              label={format(parseISO(filters.period.anchor), 'MMMM yyyy', { locale: es })}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
            />
          ) : (
            <p className="eyebrow">{periodLabel(filters.period)}</p>
          )}
          <h1 className="mt-2 font-display text-figure font-semibold">Movimientos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportCsv(transactions, categoryById)} disabled={!transactions?.length}>
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

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por descripción…"
            className="max-w-[240px]"
          />
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)} className="gap-1.5">
            <SlidersHorizontal className="size-3.5" strokeWidth={1.4} aria-hidden />
            Filtros
            {activeCount > 0 && <CountBubble count={activeCount} />}
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
              <FilterChip
                removeLabel={`Quitar filtro de período: ${MOVEMENT_PERIOD_PRESET_LABELS[filters.period.preset]}`}
                onRemove={() => setFilters((f) => ({ ...f, period: defaultMovementPeriod() }))}
              >
                {filters.period.preset === 'custom' ? periodLabel(filters.period) : MOVEMENT_PERIOD_PRESET_LABELS[filters.period.preset]}
              </FilterChip>
            )}
            {filters.type !== 'all' && (
              <FilterChip
                removeLabel={`Quitar filtro de tipo: ${filters.type === 'income' ? 'Ingresos' : 'Gastos'}`}
                onRemove={() => setFilters((f) => ({ ...f, type: 'all' }))}
              >
                {filters.type === 'income' ? 'Ingresos' : 'Gastos'}
              </FilterChip>
            )}
            {filters.categoryIds.map((id) => {
              const category = categoryById.get(id)
              return (
                <FilterChip
                  key={id}
                  color={category?.color}
                  removeLabel={`Quitar filtro de categoría: ${category?.name ?? 'categoría'}`}
                  onRemove={() => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((c) => c !== id) }))}
                >
                  {category?.name ?? 'Categoría'}
                </FilterChip>
              )
            })}
            {filters.accountIds.map((id) => {
              const isUnassigned = id === UNASSIGNED_ACCOUNT_ID
              const label = isUnassigned ? 'Sin cuenta' : accountById.get(id)?.name || '(sin nombre)'
              return (
                <FilterChip
                  key={id || 'unassigned'}
                  removeLabel={`Quitar filtro de cuenta: ${label}`}
                  onRemove={() => setFilters((f) => ({ ...f, accountIds: f.accountIds.filter((a) => a !== id) }))}
                >
                  {label}
                </FilterChip>
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
        <div className="flex flex-col gap-4">
          {transactions?.length === TRANSACTIONS_ROW_LIMIT && (
            <p className="text-[12px] text-fg-muted">
              Mostrando los primeros {TRANSACTIONS_ROW_LIMIT} movimientos — acotá el período.
            </p>
          )}
          {byDay.map(([day, items]) => {
            const total = items.reduce((acc, t) => acc + (t.type === 'income' ? t.cents : -t.cents), 0)
            return (
              <Panel key={day}>
                <GroupHeader
                  label={format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}
                  total={<Money cents={total} tone={total >= 0 ? 'dim' : 'negative'} signed />}
                  className="px-6 pt-5 pb-1"
                />
                <ul className="pb-3">
                  {items.map((tx) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      category={categoryById.get(tx.category_id ?? '')}
                      account={accountById.get(tx.account_id ?? '')}
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
          accounts={locations ?? []}
        />
      )}
    </div>
  )
}
