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
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { Money } from '@/components/ui/Money'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { TransactionRow } from '@/components/TransactionRow'
import { cn } from '@/lib/cn'
import { useCategories, type Category } from '@/features/categories/api'
import { CategoryManagerDialog } from '@/features/categories/CategoryManagerDialog'
import { useBalanceLocations, type BalanceLocation } from '@/features/reconciliation/api'
import { TRANSACTIONS_ROW_LIMIT, UNASSIGNED_ACCOUNT_ID, useTransactions, type Transaction } from '@/features/transactions/api'
import { dailySpendBars, summarizeTransactions } from '@/features/transactions/aggregate'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { TransactionFiltersDialog } from '@/features/transactions/TransactionFiltersDialog'
import { useMovimientosFilters } from '@/features/transactions/useMovimientosFilters'
import {
  MOVEMENT_PERIOD_PRESET_LABELS,
  defaultMovementPeriod,
  periodLabel,
  type MovementPeriod,
} from '@/features/transactions/movementPeriod'

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
] as const

/** Fila de la tabla ancha de escritorio — Descripción · Categoría · Cuenta · Monto en columnas
 *  fijas. En mobile se usa `TransactionRow` (el mismo compacto de Hoy): a 390px de ancho una
 *  tabla de cuatro columnas no entra sin achicar la descripción hasta ilegible. */
function MovementTableRow({
  tx,
  category,
  account,
  onClick,
}: {
  tx: Transaction
  category?: Category
  account?: BalanceLocation
  onClick: () => void
}) {
  const income = tx.type === 'income'
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[1fr_170px_150px_130px] items-center gap-3 px-6 py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
    >
      <span className="truncate text-[13.5px] font-semibold text-fg">
        {tx.description || category?.name || 'Sin descripción'}
      </span>
      <span className="flex items-center gap-1.5 truncate text-[12.5px] text-fg-secondary">
        <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? 'var(--color-border-strong)' }} />
        <span className="truncate">
          {tx.is_credit_card_payment ? `${category?.name ?? 'Sin categoría'} · Tarjeta` : (category?.name ?? 'Sin categoría')}
        </span>
      </span>
      <span className="truncate text-[12.5px] text-fg-muted">{account?.name || '—'}</span>
      <Money
        cents={income ? tx.cents : -tx.cents}
        tone={income ? 'accent' : 'negative'}
        size="row"
        signed
        className="justify-self-end"
      />
    </button>
  )
}

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

  // Resumen y barras del período — sobre la lista YA filtrada (tipo, categorías, cuentas, búsqueda),
  // así el "Neto de septiembre" de arriba nunca puede contradecir lo que se ve en la tabla de abajo.
  const summary = useMemo(
    () => summarizeTransactions(transactions ?? [], from, to, new Date()),
    [transactions, from, to],
  )
  const bars = useMemo(() => dailySpendBars(transactions ?? [], from, to), [transactions, from, to])
  const peakBar = bars.reduce((max, b) => (b.cents > max.cents ? b : max), { day: 0, cents: 0 })
  const maxBarCents = peakBar.cents

  function openNew() {
    setEditingTx(null)
    setFormOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx)
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
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
          <Button
            variant="outline"
            size="compact"
            onClick={() => exportCsv(transactions, categoryById)}
            disabled={!transactions?.length}
          >
            Exportar CSV
          </Button>
          <Button variant="outline" size="compact" onClick={() => setCategoriesOpen(true)}>
            Categorías
          </Button>
          <Button size="compact" icon={<span className="text-base leading-none">+</span>} onClick={openNew}>
            Nuevo movimiento
          </Button>
        </div>
      </header>

      {/* Resumen del período: neto, ingresos/gastos/promedio diario y gasto por día — siempre
          sobre la lista ya filtrada, nunca un total aparte del que ve la tabla de abajo. Las
          comparativas vs. el período anterior quedan apagadas acá a propósito: viven en Análisis. */}
      {/* `lg:items-start`, no `items-end`: con la columna del gráfico de barras (más alta que las
          demás en pantallas angostas, donde "Gasto por día" puede llegar a partirse en dos líneas)
          alinear abajo empujaba "Neto del período" hacia abajo, dejando un hueco arriba. */}
      <Panel className="flex flex-col gap-5 p-6 lg:flex-row lg:items-start lg:gap-9">
        <div className="flex-none">
          <p className="eyebrow">Neto del período</p>
          <Money cents={summary.netCents} tone="accent" size="total" signed className="mt-1" />
        </div>

        <div className="hidden h-14 w-px shrink-0 bg-divider lg:block" />

        {/* Apiladas en mobile, no en grilla de 3 — un importe de 7+ cifras no entra en un tercio
            de 390px sin pisar al de al lado (ver el reporte del bloque). */}
        <div className="flex flex-col gap-3 lg:flex-none lg:flex-row lg:gap-7">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Ingresos</p>
            <Money cents={summary.totalIncomeCents} tone="fg" size="compact" className="mt-1" />
            <p className="mt-0.5 text-[11.5px] text-fg-muted">
              {summary.incomeCount} movimiento{summary.incomeCount === 1 ? '' : 's'}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Gastos</p>
            <Money cents={summary.totalExpenseCents} tone="negative" size="compact" className="mt-1" />
            <p className="mt-0.5 text-[11.5px] text-fg-muted">
              {summary.expenseCount} movimiento{summary.expenseCount === 1 ? '' : 's'}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Promedio diario</p>
            <Money cents={summary.dailyAverageExpenseCents} tone="fg" size="compact" className="mt-1" />
            <p className="mt-0.5 text-[11.5px] text-fg-muted">
              de gasto, {summary.daysElapsed} día{summary.daysElapsed === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Sólo con datos que llenen un mes calendario: con un rango de un día o una semana, 30
            barras finitas no cuentan nada. */}
        {filters.period.preset === 'month' && bars.length > 1 && (
          <div className="hidden min-w-0 flex-1 lg:block">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[10.5px] font-semibold tracking-[0.09em] whitespace-nowrap text-fg-muted uppercase">
                Gasto por día
              </p>
              {maxBarCents > 0 && (
                <span className="text-[11.5px] whitespace-nowrap text-fg-muted">
                  pico el {peakBar.day} · <Money cents={peakBar.cents} tone="dim" size="inline" />
                </span>
              )}
            </div>
            <div className="mt-2.5 flex h-[54px] items-end gap-[3px]">
              {bars.map((b) => (
                <span
                  key={b.day}
                  className={cn('flex-1 rounded-[2px]', b.cents > 0 ? 'bg-negative' : 'bg-fill-subtle')}
                  style={{ height: b.cents > 0 && maxBarCents > 0 ? `${Math.max((b.cents / maxBarCents) * 100, 6)}%` : '4px' }}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="flex flex-col gap-2.5">
        {/* Buscador en su propia fila, a lo ancho — el resto (segmentado, Filtros, Limpiar,
            conteo) va debajo en mobile pero se suma a la misma línea en escritorio: `lg:contents`
            saca ese wrapper de la jugada y sus hijos pasan a ser hermanos directos del buscador. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por descripción…"
            className="w-full lg:w-auto lg:min-w-[280px]"
          />
          <div className="flex flex-wrap items-center gap-2 lg:contents">
            <SegmentedToggle
              variant="pill"
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              options={TYPE_OPTIONS}
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
            {!isPending && (
              <span className="text-[12.5px] text-fg-muted lg:ml-auto">
                {transactions?.length ?? 0} movimiento{(transactions?.length ?? 0) === 1 ? '' : 's'}
              </span>
            )}
          </div>
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

      {/* Una sola tabla ancha en vez de un `Panel` por día — antes cada grupo era su propia
          tarjeta, con el borde repitiéndose entre días; acá el corte entre días es sólo la banda
          de encabezado. */}
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
        <Panel className="overflow-hidden p-0">
          {transactions?.length === TRANSACTIONS_ROW_LIMIT && (
            <p className="px-6 pt-4 text-[12px] text-fg-muted">
              Mostrando los primeros {TRANSACTIONS_ROW_LIMIT} movimientos — acotá el período.
            </p>
          )}

          <div className="hidden grid-cols-[1fr_170px_150px_130px] gap-3 border-b border-divider px-6 pt-3.5 pb-2.5 text-[10.5px] font-semibold tracking-[0.09em] text-fg-faint uppercase lg:grid">
            <span>Descripción</span>
            <span>Categoría</span>
            <span>Cuenta</span>
            <span className="text-right">Monto</span>
          </div>

          {byDay.map(([day, items]) => {
            const total = items.reduce((acc, t) => acc + (t.type === 'income' ? t.cents : -t.cents), 0)
            return (
              <div key={day}>
                <GroupHeader
                  label={format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}
                  total={<Money cents={total} tone={total >= 0 ? 'dim' : 'negative'} signed />}
                  className="bg-divider-list px-6 py-2.5"
                />
                <ul className="lg:hidden">
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
                <ul className="hidden lg:block">
                  {items.map((tx) => (
                    <li key={tx.id} className="border-t border-divider-list first:border-t-0">
                      <MovementTableRow
                        tx={tx}
                        category={categoryById.get(tx.category_id ?? '')}
                        account={accountById.get(tx.account_id ?? '')}
                        onClick={() => openEdit(tx)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          <div className="flex items-center justify-between gap-3 border-t border-divider px-6 py-3 text-[12px] text-fg-muted">
            <span>
              {transactions?.length ?? 0} movimiento{(transactions?.length ?? 0) === 1 ? '' : 's'} del período
            </span>
            <span className="tnum">
              Gastos <Money cents={summary.totalExpenseCents} tone="dim" size="inline" /> · Ingresos{' '}
              <Money cents={summary.totalIncomeCents} tone="dim" size="inline" />
            </span>
          </div>
        </Panel>
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
