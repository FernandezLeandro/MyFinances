import { useEffect, useMemo, useState } from 'react'
import { parseISO } from 'date-fns'
import { centsToNumeric } from '@/lib/money'
import { downloadCsv } from '@/lib/csv'
import { cycleContaining, shiftCycle, type CycleConfig } from '@/lib/cycle'
import type { Category } from '@/features/categories/api'
import type { Transaction } from '@/features/transactions/api'
import { defaultMovementPeriod, periodRange, type MovementPeriod } from '@/features/transactions/movementPeriod'
import type { MovementFilters } from '@/features/transactions/TransactionFiltersDialog'

interface UseMovimientosFiltersOptions {
  initialPeriod?: MovementPeriod
  initialCategoryId?: string
  /** Drill-down desde Análisis a "Sin categoría" (AN-08 del QA): esa lista es sólo gasto, sin
   *  ajustes — sin esto, el filtro de acá (`category_id is null`, a secas) traía también ingresos y
   *  ajustes sin categoría, que no suman al total de origen. Sólo se usa junto con
   *  `initialCategoryId === UNCATEGORIZED_ID`; el resto de los orígenes (categoría real, cuenta) no
   *  lo mandan. */
  initialType?: MovementFilters['type']
  initialAccountIds?: string[]
  /** Ciclo configurado por el usuario (`useCycleConfig()`) — sólo afecta al preset 'month', que
   *  pasa a representar el ciclo (mensual/quincenal/semanal) en vez de siempre el mes calendario.
   *  Ver `periodRange` en `movementPeriod.ts`. */
  config: CycleConfig
}

/**
 * Todo lo que Movimientos necesita para manejar filtros, búsqueda y exportación — separado de la
 * página para que el JSX de filtros (chips, búsqueda) no se entrevere con esta lógica, que antes
 * vivía inline (era la página más entreverada del rediseño). `categoryById`/`transactions` no
 * entran acá: esas queries siguen viviendo en la página, que también las necesita para pintar las
 * filas — `exportCsv` sólo las recibe como parámetro al momento de exportar.
 */
export function useMovimientosFilters({
  initialPeriod,
  initialCategoryId,
  initialType,
  initialAccountIds,
  config,
}: UseMovimientosFiltersOptions) {
  const [filters, setFilters] = useState<MovementFilters>(() => ({
    period: initialPeriod ?? defaultMovementPeriod(),
    type: initialType ?? 'all',
    categoryIds: initialCategoryId ? [initialCategoryId] : [],
    accountIds: initialAccountIds ?? [],
  }))
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const { from, to } = useMemo(() => periodRange(filters.period, config), [filters.period, config])
  const categoryIds = useMemo(() => [...filters.categoryIds].sort(), [filters.categoryIds])
  const accountIds = useMemo(() => [...filters.accountIds].sort(), [filters.accountIds])

  // Nombre histórico ("mes"), pero mueve un CICLO — con `config.kind === 'monthly'` (default) es
  // exactamente `addMonths`/`subMonths` de antes (`shiftCycle` con kind mensual hace lo mismo).
  function shiftMonth(delta: number) {
    setFilters((f) => ({
      ...f,
      period: {
        ...f.period,
        anchor: shiftCycle(config, cycleContaining(config, parseISO(f.period.anchor)), delta).from,
      },
    }))
  }

  function clearAll() {
    setFilters({ period: defaultMovementPeriod(), type: 'all', categoryIds: [], accountIds: [] })
    setSearchInput('')
  }

  function exportCsv(transactions: Transaction[] | undefined, categoryById: Map<string, Category>) {
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

  const activeCount =
    (filters.period.preset !== 'month' ? 1 : 0) +
    (filters.type !== 'all' ? 1 : 0) +
    filters.categoryIds.length +
    filters.accountIds.length
  const hasFilters = activeCount > 0 || search !== ''

  return {
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
  }
}
