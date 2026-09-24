import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeftRight, Plus, SlidersHorizontal } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { CycleNav } from '@/components/ui/CycleNav'
import { useCycleConfig } from '@/lib/useCycle'
import { cycleContaining } from '@/lib/cycle'
import { AccordionHeader } from '@/components/ui/AccordionHeader'
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
import { Pagination } from '@/components/ui/Pagination'
import { TransactionRow } from '@/components/TransactionRow'
import { TransferRow } from '@/components/TransferRow'
import { cn } from '@/lib/cn'
import { UNCATEGORIZED_ID, useCategories, type Category } from '@/features/categories/api'
import { useBalanceLocations, type BalanceLocation } from '@/features/accounts/api'
import { accountNameOf } from '@/features/accounts/aggregate'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { useAccountTransfers, type AccountTransfer } from '@/features/accounts/transfers-api'
import { TransferDetailDialog } from '@/features/accounts/TransferDetailDialog'
import { TRANSACTIONS_ROW_LIMIT, UNASSIGNED_ACCOUNT_ID, useTransactions, type Transaction } from '@/features/transactions/api'
import {
  confirmDeleteMovementCopy,
  dailySpendBars,
  dailySpendPeakLabel,
  dayNetTotals,
  mergeMovementList,
  movementCategoryLabel,
  movementCountLabel,
  summarizeTransactions,
  transferAccountsLabel,
  transferDirection,
  transfersForList,
  transferSignedCents,
  type MovementListItem,
} from '@/features/transactions/aggregate'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { TransactionFiltersDialog } from '@/features/transactions/TransactionFiltersDialog'
import { useMovimientosFilters } from '@/features/transactions/useMovimientosFilters'
import { PAGE_SIZE_OPTIONS, usePageSize, type PageSize } from '@/features/transactions/usePageSize'
import {
  MOVEMENT_PERIOD_PRESET_LABELS,
  defaultMovementPeriod,
  periodLabel,
  type MovementPeriod,
} from '@/features/transactions/movementPeriod'
import { useCan } from '@/features/access/useCan'
import { useUnmarkWithLegacyConfirm } from '@/features/fixed-expenses/api'
import { UnmarkBeforeAccountsDialog } from '@/features/fixed-expenses/UnmarkBeforeAccountsDialog'
import { ConfirmDeleteMovementDialog } from '@/features/transactions/ConfirmDeleteMovementDialog'
import { MovementDetailDialog } from '@/features/transactions/MovementDetailDialog'
import { IncomeEditDialog } from '@/features/cycle-income/IncomeEditDialog'

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
] as const

/** Fila de la tabla ancha de escritorio — Descripción · Categoría · Cuenta · Monto en columnas
 *  fijas. En mobile se usa `TransactionRow` (el mismo compacto de Hoy): a 390px de ancho una
 *  tabla de cuatro columnas no entra sin achicar la descripción hasta ilegible. */
/** N7 del QA: un ajuste de saldo mostraba "Sin categoría" acá, sin distinguirse de un gasto común —
 *  `showAccount` (Bloque E): Básico "en pausa" no ve la columna de cuenta aunque el usuario tenga
 *  cuentas cargadas de antes (`useAccountPicker`), así que la grilla pasa de 4 a 3 columnas. */
function MovementTableRow({
  tx,
  category,
  account,
  showAccount,
  onClick,
}: {
  tx: Transaction
  category?: Category
  account?: BalanceLocation
  showAccount: boolean
  onClick: () => void
}) {
  const income = tx.type === 'income'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid w-full items-center gap-3 px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle',
        showAccount ? 'grid-cols-[1fr_170px_150px_130px]' : 'grid-cols-[1fr_170px_130px]',
      )}
    >
      <span className="truncate text-[13.5px] font-semibold text-fg">
        {tx.description || category?.name || 'Sin descripción'}
      </span>
      <span className="flex items-center gap-1.5 truncate text-[12.5px] text-fg-secondary">
        <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? 'var(--color-border-strong)' }} />
        <span className="truncate">{movementCategoryLabel(tx, category?.name)}</span>
      </span>
      {showAccount && <span className="truncate text-[12.5px] text-fg-muted">{account?.name || '—'}</span>}
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

/** Una transferencia en la tabla ancha de escritorio, con las mismas columnas que `MovementTableRow`
 *  (la versión mobile es `TransferRow`). Sólo existe con la columna Cuenta visible: sin Cuentas en el
 *  plan no se traen transferencias, así que no hace falta la variante de 3 columnas. */
function TransferTableRow({
  transfer,
  accountsLabel,
  signedCents,
  onClick,
}: {
  transfer: AccountTransfer
  accountsLabel: string
  signedCents: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[1fr_170px_150px_130px] items-center gap-3 px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
    >
      <span className="truncate text-[13.5px] font-semibold text-fg">{transfer.description || 'Transferencia'}</span>
      <span className="flex items-center gap-1.5 truncate text-[12.5px] text-fg-secondary">
        <span aria-hidden className="flex size-[7px] shrink-0 items-center justify-center">
          <ArrowLeftRight className="size-3 shrink-0 text-fg-muted" strokeWidth={1.8} />
        </span>
        <span className="truncate">Transferencia</span>
      </span>
      <span className="truncate text-[12.5px] text-fg-muted" title={accountsLabel}>
        {accountsLabel}
      </span>
      <Money
        cents={signedCents !== 0 ? signedCents : transfer.cents}
        tone="dim"
        size="row"
        signed={signedCents !== 0}
        className="justify-self-end"
      />
    </button>
  )
}

export function Movimientos() {
  // Llega acá desde el drill-down de Análisis (categoría + período) o desde "Ver movimientos" de una
  // cuenta en Cuentas (el filtro de cuenta en sí, con un período bien amplio para no limitarlo al
  // mes actual).
  const location = useLocation()
  const navigate = useNavigate()
  const incoming = location.state as { categoryId?: string; period?: MovementPeriod; accountIds?: string[] } | null
  const cycleConfig = useCycleConfig()

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
    config: cycleConfig,
  })

  // Bloque 4 del plan "BASIC centrado en fijos": sin `movimientos-manuales` no hay nada que cargar
  // ni editar suelto — los movimientos de ese plan sólo salen de pagar un fijo, y la única acción
  // sobre una fila es deshacer ese pago (ver `openEdit`).
  const canMovimientosManuales = useCan('movimientos-manuales')
  const unmarkFixedPayment = useUnmarkWithLegacyConfirm()

  const [formOpen, setFormOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [viewingTransfer, setViewingTransfer] = useState<AccountTransfer | null>(null)
  // FI-05 del QA de Fijos: antes, tocar la fila de un fijo en Básico lo despagaba al instante, sin
  // avisar — ahora el toque pide confirmar en `ConfirmDeleteMovementDialog` antes de llamar a
  // `unmarkFixedPayment`.
  const [pendingUnmarkTx, setPendingUnmarkTx] = useState<Transaction | null>(null)
  // Bloque 4 del arreglo de Movimientos (D1, MO-08): detalle de sólo lectura de un ajuste de saldo
  // (cualquier plan) o, en Básico, de cualquier otro movimiento suelto (Bloque 5, D2).
  const [viewingMovement, setViewingMovement] = useState<Transaction | null>(null)
  // Bloque 5 (D2, MO-11): edición chica de "Sueldo" en Básico.
  const [editingIncomeTx, setEditingIncomeTx] = useState<Transaction | null>(null)
  // Sólo pesa en mobile (el toggle que lo prende va `lg:hidden`): en escritorio el resumen se ve
  // siempre. Colapsado por default — lo primero en mobile es buscar/filtrar/ver movimientos, no
  // el resumen del período.
  const [summaryOpen, setSummaryOpen] = useState(false)

  // Paginación del lado del cliente: se sigue trayendo el período entero (tope `TRANSACTIONS_ROW_LIMIT`
  // más abajo) y se corta en páginas acá — el contador de la barra de filtros, el pie de la tabla, el
  // resumen y "Exportar CSV" siguen usando la lista completa, sin paginar.
  const [pageSize, setPageSize] = usePageSize()
  const [page, setPage] = useState(1)

  const { data: transactions, isPending, isError, refetch } = useTransactions({
    from,
    to,
    type: filters.type === 'all' ? undefined : filters.type,
    categoryIds,
    accountIds,
    text: search || undefined,
  })
  // El resumen (neto, ingresos/gastos/promedio, barras) es del mes entero — no se mueve con tipo,
  // categoría, cuenta ni búsqueda, sólo con el período. Consulta aparte, sin esos filtros; con todo
  // en "Todos" y sin buscar, cae en la misma key que `transactions` y React Query la resuelve del
  // caché sin pegarle a la red dos veces.
  const { data: periodTransactions } = useTransactions({ from, to })
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const accountById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations])
  // Básico "en pausa" (bloque E del re-test de QA): sin cuentas del plan, ni la columna ni el
  // filtro "Cuenta" se ofrecen, aunque el usuario tenga cuentas cargadas de antes de bajar de plan.
  const { show: showAccounts } = useAccountPicker()

  // Transferencias entre cuentas: se MUESTRAN en la lista, mezcladas con los movimientos, pero no
  // entran en el resumen, las barras ni el CSV — no son gasto ni ingreso (ver `transfersForList`).
  // Mismo corte que la columna Cuenta: sin Cuentas en el plan, ni se consultan.
  const { data: transfers, isPending: isTransfersQueryPending } = useAccountTransfers({ enabled: showAccounts })
  const isTransfersPending = showAccounts && isTransfersQueryPending
  const visibleTransfers = useMemo(() => {
    if (!showAccounts || !transfers) return []
    const list = transactions ?? []
    return transfersForList(transfers, {
      from,
      to,
      type: filters.type,
      categoryIds,
      accountIds,
      text: search || undefined,
      truncatedBefore: list.length === TRANSACTIONS_ROW_LIMIT ? list[list.length - 1].occurred_on : undefined,
    })
  }, [showAccounts, transfers, transactions, from, to, filters.type, categoryIds, accountIds, search])
  const items = useMemo(() => mergeMovementList(transactions ?? [], visibleTransfers), [transactions, visibleTransfers])
  const countLabel = movementCountLabel(transactions?.length ?? 0, visibleTransfers.length)

  /** Lo mismo para `TransferRow` (mobile) y `TransferTableRow` (escritorio): signo y cuentas según el
   *  filtro de cuenta, y el tap abre el detalle con «Eliminar». */
  function transferRowProps(transfer: AccountTransfer) {
    const direction = transferDirection(transfer, accountIds)
    return {
      transfer,
      accountsLabel: transferAccountsLabel(
        direction,
        accountNameOf(accountById, transfer.from_account_id),
        accountNameOf(accountById, transfer.to_account_id),
      ),
      signedCents: transferSignedCents(transfer, accountIds),
      onClick: () => setViewingTransfer(transfer),
    }
  }

  const totalCount = items.length
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  // Clampeada en el render, no sólo en el `useEffect` de abajo — si la lista se achica sola (ej. se
  // borró el último movimiento de la última página) y `page` quedó fuera de rango, esto evita un
  // frame con la tabla vacía antes de que el effect corrija el estado.
  const effectivePage = Math.min(page, pageCount)

  // Vuelve a la página 1 apenas cambia lo que determina QUÉ se lista — si no, cambiar de mes con la
  // página en 3 podría mostrar una página vacía o, peor, un tercer grupo de días que no tiene nada
  // que ver con el período nuevo.
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, filters.type, categoryIds, accountIds, search, pageSize])

  // Persiste el clamp del render de arriba en el estado, para que "anterior" desde acá siga dando
  // la página correcta.
  useEffect(() => {
    setPage(effectivePage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePage])

  const pagedItems = useMemo(
    () => items.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [items, effectivePage, pageSize],
  )

  // Neto de cada DÍA, sobre la lista completa — si un día queda partido entre dos páginas, el
  // encabezado sigue mostrando el total real de ese día, no sólo el de lo que entró en esta página.
  // Sin ajustes (N7 del QA): antes un "Ajuste de saldo" se sumaba acá como si fuera un gasto real del
  // día, con montos de millones si el ajuste venía de "Dejar de usar Cuentas". Las transferencias
  // suman sólo filtrando por cuenta (sin filtro valen 0, ver `transferSignedCents`).
  const dayTotals = useMemo(
    () => dayNetTotals(transactions ?? [], visibleTransfers, accountIds),
    [transactions, visibleTransfers, accountIds],
  )

  const byDay = useMemo(() => {
    const groups = new Map<string, MovementListItem[]>()
    for (const item of pagedItems) {
      const list = groups.get(item.occurredOn) ?? []
      list.push(item)
      groups.set(item.occurredOn, list)
    }
    return [...groups.entries()]
  }, [pagedItems])

  function goToPage(next: number) {
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const summary = useMemo(
    () => summarizeTransactions(periodTransactions ?? [], from, to, new Date()),
    [periodTransactions, from, to],
  )
  const bars = useMemo(() => dailySpendBars(periodTransactions ?? [], from, to), [periodTransactions, from, to])
  const peakBar = bars.reduce((max, b) => (b.cents > max.cents ? b : max), { date: '', day: 0, cents: 0 })
  const maxBarCents = peakBar.cents
  // Con un ciclo semanal (bloque 5 del plan) el rango puede cruzar el borde del mes — ahí "pico el
  // 5" es ambiguo (¿de qué mes?) y el label agrega el mes. Casi siempre `true` (mensual/quincenal
  // nunca cruzan, y la mayoría de las semanas tampoco).
  const barsSameMonth = bars.length === 0 || bars.every((b) => b.date.slice(0, 7) === bars[0].date.slice(0, 7))

  function openNew() {
    setEditingTx(null)
    setFormOpen(true)
  }

  function openEdit(tx: Transaction) {
    // Bloque 4 del arreglo de Movimientos (D1, MO-08): un ajuste de saldo no se edita más desde
    // acá — sólo se ve el detalle y se puede eliminar, avisando antes cómo queda la cuenta. Aplica
    // en cualquier plan, antes de mirar `canMovimientosManuales`.
    if (tx.is_adjustment) {
      setViewingMovement(tx)
      return
    }
    if (!canMovimientosManuales) {
      // Un movimiento generado al pagar un fijo se "deshace" con un toque (mismo criterio que el
      // desmarcado de Fijos.tsx), pero ahora pide confirmar primero (FI-05).
      if (tx.fixed_expense_payment_id) {
        setPendingUnmarkTx(tx)
        return
      }
      // Bloque 5 (D2, MO-11): la única forma de cargar un ingreso en Básico es "Sueldo" — abre una
      // edición chica (importe y detalle), no el formulario completo. Cualquier otro movimiento
      // suelto que haya quedado de antes de bajar a este plan queda de sólo lectura, con Eliminar.
      if (tx.type === 'income') {
        setEditingIncomeTx(tx)
        return
      }
      setViewingMovement(tx)
      return
    }
    setEditingTx(tx)
    setFormOpen(true)
  }

  function confirmUnmarkPayment() {
    if (pendingUnmarkTx?.fixed_expense_payment_id) unmarkFixedPayment.unmarkPayment(pendingUnmarkTx.fixed_expense_payment_id)
    setPendingUnmarkTx(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        {/* Mobile: título a la izquierda, píldora de mes a la derecha, una sola fila — como en
            `02 Movimientos.dc.html`. */}
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <h1 className="font-display text-figure font-semibold">Movimientos</h1>
          {filters.period.preset === 'month' ? (
            <CycleNav
              cycle={cycleContaining(cycleConfig, parseISO(filters.period.anchor))}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
            />
          ) : (
            <p className="text-[11.5px] text-fg-muted">{periodLabel(filters.period)}</p>
          )}
        </div>

        {/* Escritorio: la píldora de mes arriba, chica, y el título grande debajo — como ya
            estaba. */}
        <div className="hidden lg:block">
          {filters.period.preset === 'month' ? (
            <CycleNav
              cycle={cycleContaining(cycleConfig, parseISO(filters.period.anchor))}
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
          <Button variant="outline" size="compact" onClick={() => navigate('/categorias')}>
            Categorías
          </Button>
          {/* MO-15 del QA de Movimientos: el `+` de la isla mobile es `md:hidden`
              (`MobileTabBar.tsx`) — con este botón recién a partir de `lg` (1024px), entre 768 y
              1023px no había ninguna forma de cargar un movimiento suelto. Pasa a `md:block`
              (768px), el mismo punto en el que la isla desaparece, para no dejar ningún hueco. Sin
              `movimientos-manuales` no hay nada que cargar suelto — el `+` de la isla ya abre el
              selector de fijo, este botón no tiene equivalente acá. */}
          {canMovimientosManuales && (
            <div className="hidden md:block">
              <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={openNew}>
                Nuevo movimiento
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* En mobile el resumen queda plegado por default — lo primero es poder buscar/filtrar y ver
          los movimientos, no el resumen del período. En escritorio no hay toggle: el `<Panel>`
          siempre se ve. */}
      <AccordionHeader
        label="Ver resumen del período"
        expanded={summaryOpen}
        onToggle={() => setSummaryOpen((v) => !v)}
        className="lg:hidden"
      />

      {/* Resumen del período: neto, ingresos/gastos/promedio diario y gasto por día. Es del mes
          entero — no se mueve con tipo/categoría/cuenta/búsqueda, sólo con el período (ver
          `periodTransactions` más arriba); por ahora, al menos. Las comparativas vs. el período
          anterior quedan apagadas acá a propósito: viven en Análisis. */}
      <Panel
        className={cn(
          'flex-col gap-5 p-panel lg:flex-row lg:items-center lg:gap-9',
          summaryOpen ? 'flex' : 'hidden',
          'lg:flex',
        )}
      >
        <div className="flex-none">
          <p className="eyebrow">Neto del período</p>
          <Money cents={summary.netCents} tone="accent" size="total" signed className="mt-1" />
        </div>

        <div className="hidden h-14 w-px shrink-0 bg-divider lg:block" />

        {/* Fila mobile 1: Ingresos + Gastos lado a lado. `lg:contents` los devuelve a ser hermanos
            sueltos de la fila principal en escritorio, igual que antes. */}
        <div className="grid grid-cols-2 gap-4 lg:contents">
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
        </div>

        {/* Fila mobile 2: Promedio diario + gráfico, uno al lado del otro (mismo truco de
            `lg:contents` para volver a la fila principal en escritorio). */}
        <div className="flex items-start gap-4 lg:contents">
          <div className="flex-none">
            <p className="text-[10.5px] font-semibold tracking-[0.09em] whitespace-nowrap text-fg-muted uppercase">
              Promedio diario
            </p>
            <Money cents={summary.dailyAverageExpenseCents} tone="fg" size="compact" className="mt-1" />
            <p className="mt-0.5 text-[11.5px] whitespace-nowrap text-fg-muted">
              de gasto, {summary.daysElapsed} día{summary.daysElapsed === 1 ? '' : 's'}
            </p>
          </div>

          {/* Sólo con datos que llenen un mes calendario: con un rango de un día o una semana, 30
              barras finitas no cuentan nada. 30px de alto (antes 54): a la altura de las otras
              columnas alineadas por el centro, una barra más baja se nota menos si esta columna
              queda más alta que el resto por el renglón de "pico el N". */}
          {filters.period.preset === 'month' && bars.length > 1 && (
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[10.5px] font-semibold tracking-[0.09em] whitespace-nowrap text-fg-muted uppercase">
                  Gasto por día
                </p>
                {maxBarCents > 0 && (
                  <span className="text-[11.5px] whitespace-nowrap text-fg-muted">
                    pico el {dailySpendPeakLabel(peakBar, barsSameMonth)} · <Money cents={peakBar.cents} tone="dim" size="inline" />
                  </span>
                )}
              </div>
              <div className="mt-2.5 flex h-[30px] items-end gap-[3px]">
                {bars.map((b) => (
                  <span
                    key={b.date}
                    className={cn('flex-1 rounded-[2px]', b.cents > 0 ? 'bg-negative' : 'bg-fill-subtle')}
                    style={{ height: b.cents > 0 && maxBarCents > 0 ? `${Math.max((b.cents / maxBarCents) * 100, 10)}%` : '4px' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
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
            {/* `flex-1` en mobile: junto con Filtros, ocupa el mismo ancho que el buscador de
                arriba — en escritorio vuelve a su tamaño natural, al lado del resto. */}
            <SegmentedToggle
              variant="pill"
              value={filters.type}
              onChange={(type) => setFilters((f) => ({ ...f, type }))}
              options={TYPE_OPTIONS}
              className="flex-1 lg:flex-none"
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
            {!isPending && !isTransfersPending && <span className="text-[12.5px] text-fg-muted lg:ml-auto">{countLabel}</span>}
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
              const isUncategorized = id === UNCATEGORIZED_ID
              const category = categoryById.get(id)
              const label = isUncategorized ? 'Sin categoría' : (category?.name ?? 'Categoría')
              return (
                <FilterChip
                  key={id}
                  color={category?.color}
                  removeLabel={`Quitar filtro de categoría: ${label}`}
                  onRemove={() => setFilters((f) => ({ ...f, categoryIds: f.categoryIds.filter((c) => c !== id) }))}
                >
                  {label}
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
      ) : isPending || isTransfersPending ? (
        <Panel>
          <ul className="flex flex-col gap-1 px-panel py-5">
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
            hint={
              hasFilters
                ? 'Probá sacando algún filtro.'
                : canMovimientosManuales
                  ? 'Cargá tu primer movimiento.'
                  : 'Acá vas a ver los movimientos de pagar tus fijos.'
            }
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Limpiar filtros
                </Button>
              ) : canMovimientosManuales ? (
                <Button onClick={openNew}>Nuevo movimiento</Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden p-0">
          {transactions?.length === TRANSACTIONS_ROW_LIMIT && (
            <p className="px-panel pt-4 text-[12px] text-fg-muted">
              Mostrando los primeros {TRANSACTIONS_ROW_LIMIT} movimientos — acotá el período.
            </p>
          )}

          <div
            className={cn(
              'hidden gap-3 border-b border-divider px-panel pt-3.5 pb-2.5 text-[10.5px] font-semibold tracking-[0.09em] text-fg-faint uppercase lg:grid',
              showAccounts ? 'grid-cols-[1fr_170px_150px_130px]' : 'grid-cols-[1fr_170px_130px]',
            )}
          >
            <span>Descripción</span>
            <span>Categoría</span>
            {showAccounts && <span>Cuenta</span>}
            <span className="text-right">Monto</span>
          </div>

          {byDay.map(([day, dayItems]) => {
            const total = dayTotals.get(day) ?? 0
            return (
              <div key={day}>
                <GroupHeader
                  label={format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}
                  total={<Money cents={total} tone={total >= 0 ? 'dim' : 'negative'} signed />}
                  className="bg-divider-list px-panel py-2.5"
                />
                <ul className="lg:hidden">
                  {dayItems.map((item) =>
                    item.kind === 'tx' ? (
                      <TransactionRow
                        key={item.key}
                        tx={item.tx}
                        category={categoryById.get(item.tx.category_id ?? '')}
                        account={showAccounts ? accountById.get(item.tx.account_id ?? '') : undefined}
                        onClick={() => openEdit(item.tx)}
                      />
                    ) : (
                      <TransferRow key={item.key} {...transferRowProps(item.transfer)} />
                    ),
                  )}
                </ul>
                <ul className="hidden lg:block">
                  {dayItems.map((item) => (
                    <li key={item.key} className="border-t border-divider-list first:border-t-0">
                      {item.kind === 'tx' ? (
                        <MovementTableRow
                          tx={item.tx}
                          category={categoryById.get(item.tx.category_id ?? '')}
                          account={accountById.get(item.tx.account_id ?? '')}
                          showAccount={showAccounts}
                          onClick={() => openEdit(item.tx)}
                        />
                      ) : (
                        <TransferTableRow {...transferRowProps(item.transfer)} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {/* Sólo si hay algo que paginar — con 10 o menos, ningún tamaño de página corta nada. */}
          {totalCount > 10 && (
            <Pagination
              page={effectivePage}
              pageCount={pageCount}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              total={totalCount}
              onPageChange={goToPage}
              onPageSizeChange={(size) => setPageSize(size as PageSize)}
            />
          )}

          <div className="flex items-center justify-between gap-3 border-t border-divider px-panel py-3 text-[12px] text-fg-muted">
            <span>{countLabel} del período</span>
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
      {viewingTransfer && <TransferDetailDialog transfer={viewingTransfer} onClose={() => setViewingTransfer(null)} />}
      {viewingMovement && <MovementDetailDialog transaction={viewingMovement} onClose={() => setViewingMovement(null)} />}
      {editingIncomeTx && <IncomeEditDialog transaction={editingIncomeTx} onClose={() => setEditingIncomeTx(null)} />}
      {filtersOpen && (
        <TransactionFiltersDialog
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          value={filters}
          onApply={setFilters}
          categories={categories ?? []}
          accounts={showAccounts ? (locations ?? []) : []}
        />
      )}
      <UnmarkBeforeAccountsDialog
        open={unmarkFixedPayment.confirmOpen}
        busy={unmarkFixedPayment.isPending}
        onClose={unmarkFixedPayment.cancelConfirm}
        onConfirm={unmarkFixedPayment.confirmForce}
      />
      <ConfirmDeleteMovementDialog
        open={!!pendingUnmarkTx}
        busy={unmarkFixedPayment.isPending}
        copy={confirmDeleteMovementCopy({ kind: 'payment', description: pendingUnmarkTx?.description ?? null })}
        onClose={() => setPendingUnmarkTx(null)}
        onConfirm={confirmUnmarkPayment}
      />
    </div>
  )
}
