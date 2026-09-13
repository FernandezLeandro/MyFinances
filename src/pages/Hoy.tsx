import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { format, isSameDay, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { useCycle } from '@/lib/useCycle'
import { cycleShortLabel } from '@/lib/cycle'
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
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { cn } from '@/lib/cn'
import { useCategories } from '@/features/categories/api'
import {
  useCurrentBalance,
  useRangeSummary,
  useSpendByCategory,
  useTransactions,
  type Transaction,
} from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { CuadrarSaldoDialog } from '@/features/reconciliation/CuadrarSaldoDialog'
import { useCan } from '@/features/access/useCan'
import { useBalanceLocations } from '@/features/reconciliation/api'
import { summarizeMisDeudas } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallmentsRange,
  useCreditPurchasePayments,
  useStandalonePurchases,
} from '@/features/credits/api'
import {
  useFixedExpensePayments,
  useFixedExpenses,
  useFixedExpenseSavings,
  useProjectedBalanceRange,
} from '@/features/fixed-expenses/api'
import { fixedExpenseUrgency, summarizeFixedExpenses, type FixedExpenseUrgency } from '@/features/fixed-expenses/aggregate'
import { FijosCicloCard } from '@/features/fixed-expenses/FijosCicloCard'
import { RegisterFixedExpenseDialog } from '@/features/fixed-expenses/RegisterFixedExpenseDialog'
import { AssignIncomeDialog } from '@/features/cycle-income/AssignIncomeDialog'

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

// El widget de Movimientos muestra los últimos 5 fijos en mobile; en escritorio, los que entren
// hasta el borde de la pantalla sin obligar a scrollear, con 5 de piso y 12 de techo.
const MOVEMENTS_DESKTOP_QUERY = '(min-width: 1024px)' // mismo breakpoint que `lg:` en Tailwind
const MOVEMENTS_PREVIEW_MIN = 5
const MOVEMENTS_PREVIEW_MAX = 12
/** El padding inferior del `<main>` (`md:pb-16` = 64px) más 8px de aire contra redondeos. */
const MOVEMENTS_MAIN_BOTTOM_PADDING = 72
/** El `gap-1` que separa un grupo de día del siguiente dentro de la lista. */
const MOVEMENTS_GROUP_GAP = 4

export function Hoy() {
  const [open, setOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [assignIncomeOpen, setAssignIncomeOpen] = useState(false)
  const [cuadrarOpen, setCuadrarOpen] = useState(false)
  const canCuadrar = useCan('cuadrar-saldo')
  // Bloque 4 del plan "BASIC centrado en fijos": sin `movimientos-manuales` (BASIC), Hoy no tiene
  // con qué mostrar saldo/proyectado (no hay movimientos manuales) — el hero pasa a ser
  // `FijosCicloCard` y el "Proyectado a fin de mes" desaparece entero. Análisis y Mis deudas se
  // ocultan con el mismo criterio que ya gatea sus propias rutas (`RequireCapability`) — esto sólo
  // evita ofrecer en Hoy lo que la ruta de al lado ya rechaza.
  const canMovimientosManuales = useCan('movimientos-manuales')
  const canAnalisis = useCan('analisis')
  const canMisDeudas = useCan('mis-deudas')
  const today = new Date()

  // Hoy nunca navega — siempre muestra el ciclo que contiene a hoy (`useCycle()` sin flechas). Con
  // el ciclo mensual de siempre (default de todo usuario que no configuró nada en Ajustes) esto es
  // exactamente `monthStart`/`monthEnd` de antes; con quincenal/semanal, la mitad o la semana en
  // curso — el cambio de comportamiento que el bloque 3 del plan de ciclos habilita a propósito.
  const { cycle, config } = useCycle()
  const cycleFrom = cycle.from
  const cycleTo = cycle.to
  // Los pagos/ahorros/cuotas siguen atados al MES (eje B, no configurable — ver `src/lib/cycle.ts`):
  // con ciclo mensual o quincenal el rango nunca toca más de un mes (`cycle.months` tiene un solo
  // elemento). El semanal (bloque 5) sí puede cruzar dos — `cycle.months` ya trae los que hagan
  // falta, y los 4 hooks de abajo aceptan varios períodos a la vez.
  const monthsOfCycle = cycle.months

  const balance = useCurrentBalance()
  const summary = useRangeSummary(cycleFrom, cycleTo)
  const monthTransactions = useTransactions({ from: cycleFrom, to: cycleTo })
  const spendQuery = useSpendByCategory(cycleFrom, cycleTo)
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()
  const [balanceHidden, toggleBalanceHidden] = useHiddenBalance('saldo-actual')

  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalanceRange(cycleFrom, cycleTo)
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(monthsOfCycle)
  const { data: fixedSavings } = useFixedExpenseSavings(monthsOfCycle)
  const { data: cards } = useCreditCards()
  const { data: standalonePurchases } = useStandalonePurchases()
  const { data: installments } = useCreditInstallmentsRange(cycleFrom, cycleTo)
  const { data: savings } = useCreditCardSavings(monthsOfCycle)
  const { data: cardPayments } = useCreditCardPayments(monthsOfCycle)
  const { data: purchasePayments } = useCreditPurchasePayments(monthsOfCycle)

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

  const {
    pending: pendingFixed,
    done: doneFixed,
    pendingTotalCents: pendingFixedTotal,
    savedTotalCents: savedFixedTotal,
    missingToSaveCents: missingToSaveFixedTotal,
  } = useMemo(
    () =>
      summarizeFixedExpenses(
        fixedExpenses ?? [],
        fixedPayments ?? [],
        today,
        today,
        cycle,
        cycle.months,
        config.weekStartsOn,
        fixedSavings ?? [],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` es estable dentro del render
    [fixedExpenses, fixedPayments, fixedSavings, cycle, config],
  )
  // Sólo para `FijosCicloCard` (BASIC, sin `movimientos-manuales`): total y pagado de TODOS los
  // fijos elegibles del ciclo, pagados o no — mismo criterio que `totalCents`/`paidCentsTotal` en
  // Fijos.tsx.
  const totalFixedCents = useMemo(
    () => [...pendingFixed, ...doneFixed].reduce((acc, s) => acc + s.fe.cents, 0),
    [pendingFixed, doneFixed],
  )
  const paidFixedCents = useMemo(
    () => [...pendingFixed, ...doneFixed].reduce((acc, s) => acc + s.paidCents, 0),
    [pendingFixed, doneFixed],
  )

  // Sólo lo que realmente "vence" — una bolsa mensual no tiene día de vencimiento, así que no
  // compite acá con los fijos de una sola vez (ver `fixedExpenseUrgency`).
  const upcoming = useMemo(
    () =>
      pendingFixed
        .filter((s) => s.dueDate != null)
        // Por fecha real, no por día del mes crudo — ver el mismo criterio en Fijos.tsx `groups`.
        .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))
        .slice(0, 4),
    [pendingFixed],
  )

  const currentBalanceCents = balance.data ?? 0
  const isDesktop = useMediaQuery(MOVEMENTS_DESKTOP_QUERY)

  // Cuántos movimientos entran sin scrollear. El cálculo es de una sola pasada: mide el espacio
  // libre hasta el borde de la ventana y las alturas de una fila y de un encabezado de día, y de
  // ahí saca el número por aritmética. Ninguna de esas tres medidas depende de cuántas filas haya
  // renderizadas, así que volver a medir después de cambiar el conteo da siempre lo mismo y el
  // efecto se estabiliza solo — a diferencia de ajustar de a un ítem contra un `ResizeObserver`,
  // que oscilaba para siempre cuando el punto de ajuste caía entre dos enteros.
  const movementsListRef = useRef<HTMLDivElement>(null)
  const [movementsCount, setMovementsCount] = useState(MOVEMENTS_PREVIEW_MIN)

  useLayoutEffect(() => {
    const fit = () => {
      if (!window.matchMedia(MOVEMENTS_DESKTOP_QUERY).matches) {
        setMovementsCount(MOVEMENTS_PREVIEW_MIN)
        return
      }
      const list = movementsListRef.current
      const all = monthTransactions.data
      if (!list || !all?.length) return

      // Alturas unitarias, tomadas del primer grupo ya renderizado: fila y encabezado miden igual
      // sin importar cuántos haya.
      const rowHeight = list.querySelector('li')?.getBoundingClientRect().height ?? 0
      const headerHeight = list.firstElementChild?.firstElementChild?.getBoundingClientRect().height ?? 0
      if (!rowHeight) return

      // Lo que la lista ya ocupa más lo que queda libre debajo del panel que la contiene. Medirlo
      // así incluye solo el padding del panel sin tener que hardcodearlo, y es invariante al
      // conteo: si la lista crece, el hueco de abajo se achica en la misma cantidad.
      const panelBottom = list.parentElement?.getBoundingClientRect().bottom ?? 0
      const budget =
        list.getBoundingClientRect().height +
        (window.innerHeight - panelBottom - MOVEMENTS_MAIN_BOTTOM_PADDING)
      let used = 0
      let fitted = 0
      let lastLabel: string | null = null
      for (const tx of all) {
        if (fitted >= MOVEMENTS_PREVIEW_MAX) break
        const label = dayLabel(tx.occurred_on, today)
        const opensGroup = label !== lastLabel
        const cost = rowHeight + (opensGroup ? headerHeight + (fitted ? MOVEMENTS_GROUP_GAP : 0) : 0)
        if (used + cost > budget) break
        used += cost
        fitted += 1
        lastLabel = label
      }
      setMovementsCount(Math.max(MOVEMENTS_PREVIEW_MIN, fitted))
    }

    fit()
    const mql = window.matchMedia(MOVEMENTS_DESKTOP_QUERY)
    window.addEventListener('resize', fit)
    mql.addEventListener('change', fit)
    return () => {
      window.removeEventListener('resize', fit)
      mql.removeEventListener('change', fit)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` es estable dentro del render
  }, [monthTransactions.data, movementsCount])

  // `monthTransactions` ya viene ordenado del más nuevo al más viejo, así que los primeros son
  // exactamente "los últimos".
  const visibleTransactions = useMemo(
    () => (monthTransactions.data ?? []).slice(0, movementsCount),
    [monthTransactions.data, movementsCount],
  )

  const groupedRecent = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of visibleTransactions) {
      const label = dayLabel(tx.occurred_on, today)
      const list = groups.get(label) ?? []
      list.push(tx)
      groups.set(label, list)
    }
    return [...groups.entries()]
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` es estable dentro del render
  }, [visibleTransactions])

  const totalIncome = summary.data?.totalIncome ?? 0
  const totalExpense = summary.data?.totalExpense ?? 0
  const totalFlow = totalIncome + totalExpense
  const incomePct = totalFlow > 0 ? (totalIncome / totalFlow) * 100 : 0
  const expensePct = totalFlow > 0 ? (totalExpense / totalFlow) * 100 : 0

  // Con ciclo mensual da exactamente lo mismo que `format(today, 'MMMM', {locale: es})` de antes
  // ("septiembre"); con quincenal/semanal, el rango corto ("5–20 sep"). El resto del copy fijo
  // ("Flujo del mes", "este mes") queda con la palabra "mes" a propósito por ahora — generalizarlo
  // es trabajo de UI aparte, no de esta migración de datos (ver plan, bloque 6).
  const monthLabel = cycleShortLabel(cycle)
  const spend = spendQuery.data ?? []
  const spendTotal = spend.reduce((acc, s) => acc + s.cents, 0)

  // Bloque 4: sin `movimientos-manuales`, ni el proyectado ni el donut tienen con qué calcularse
  // (no hay saldo/ingresos reales) — la franja de escritorio de 3 columnas queda sólo con
  // Vencimientos, a lo ancho en vez de 1 de 3 columnas con dos huecos vacíos al lado.
  const showDesktopExtras = canMovimientosManuales || canAnalisis

  return (
    <div className="flex flex-col gap-4">
      {canMovimientosManuales ? (
        /* Saldo actual — la única cifra que contesta "cuánto me queda para gastar". */
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
            {/* `flex-wrap`: `--text-figure` ya llega clampeado a su mínimo (25px) en mobile, así que
                con importes de millones las dos cifras no entran lado a lado en una pantalla de
                ~390px y se salían de la tarjeta. Envolviendo, Gastos baja a su propia línea sólo
                cuando hace falta — no depende de cuántos dígitos tenga el número. */}
            <StatRow className="mt-3.5 flex-wrap gap-6 lg:gap-8">
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

          {/* En mobile van debajo del saldo — el `+` de la isla duplica "Nuevo movimiento", pero es el
              atajo más a mano y "Cuadrar saldo" no tiene ningún otro lugar desde donde abrirse ahí.
              En escritorio quedan apiladas en una columna angosta.

              `flex-wrap` + `grow shrink-0` en vez de `flex-1`: los dos botones tienen
              `whitespace-nowrap`, así que no achican por debajo del ancho de su texto — con `flex-1`
              (que fuerza base 0 y asume que van a entrar) el segundo se salía de la tarjeta hasta
              60px en pantallas de 360-414px. Así se acomodan solos: lado a lado si entran, uno arriba
              del otro si no, y `grow` los estira a lo que quede libre en su fila. */}
          <div className="flex flex-none flex-wrap gap-2 lg:ml-auto lg:w-[186px] lg:flex-col lg:flex-nowrap">
            <Button
              className="grow shrink-0 lg:grow-0"
              onClick={() => setOpen(true)}
              icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}
            >
              Nuevo movimiento
            </Button>
            {canCuadrar && (
              <Button variant="outline" className="grow shrink-0 lg:grow-0" onClick={() => setCuadrarOpen(true)}>
                Cuadrar saldo
              </Button>
            )}
          </div>
        </Panel>
      ) : (
        <FijosCicloCard
          cycleLabel={monthLabel}
          totalCents={totalFixedCents}
          paidCents={paidFixedCents}
          savedCents={savedFixedTotal}
          missingToSaveCents={missingToSaveFixedTotal}
          pendingCents={pendingFixedTotal}
          incomeCents={totalIncome}
          onAssignIncome={() => setAssignIncomeOpen(true)}
          hidden={balanceHidden}
          onRegister={() => setRegisterOpen(true)}
        />
      )}

      {/* Proyectado · En qué se fue el mes · Vencimientos — desktop. `isDesktop` en vez de
          `hidden lg:grid`: este bloque puede montar el `CategoryDonut` (recharts), y un
          `ResponsiveContainer` dentro de un `display:none` mide 0×0 y llena la consola de warnings
          — con el gate en JS, en mobile directamente no se monta. Sin `movimientos-manuales` ni
          `analisis` (BASIC) sólo queda Vencimientos, a lo ancho (`showDesktopExtras`). */}
      {isDesktop && (
        <div className={cn('grid gap-4', showDesktopExtras && 'lg:grid-cols-3')}>
          {canMovimientosManuales && (
            <SaldoProyectadoPanel
              title="Proyectado a fin de mes"
              projectedCents={projectedBalance}
              isPending={isProjectedPending}
              currentBalanceCents={currentBalanceCents}
              pendingFixedCount={pendingFixed.length}
              pendingFixedCents={pendingFixedTotal}
              savedFixedCents={savedFixedTotal}
              unpaidDebtsCount={unpaidDebtsCount}
              unpaidDebtsCents={misDeudasSummary.totalPendingCents}
              hidden={balanceHidden}
            />
          )}

          {canAnalisis && (
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
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? 'var(--color-border-strong)' }} />
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
          )}

          <Panel className={cn('p-[22px]', !showDesktopExtras && 'lg:col-span-3')}>
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
                  const urgency = fixedExpenseUrgency(parseISO(status.dueDate as string), today)
                  return (
                    <li key={status.fe.id} className="flex items-center gap-2.5 py-1.5">
                      <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${urgencyDotClass[urgency]}`} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-fg">{status.fe.name}</span>
                        {/* Bloque 3: sólo si ya guardó algo — no vale la pena una línea en $0 por
                            cada fijo pendiente. */}
                        {status.savedCents > 0 && (
                          <span className="block text-[11px] text-fg-muted">
                            <Money cents={Math.min(status.savedCents, status.remainingCents)} tone="dim" size="inline" hidden={balanceHidden} />{' '}
                            guardado
                          </span>
                        )}
                      </div>
                      <Badge variant={urgencyBadgeVariant[urgency]}>{urgencyTag(dueDay, urgency)}</Badge>
                      <Money cents={status.remainingCents} tone="fg" size="row" hidden={balanceHidden} />
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* Proyectado a fin de mes (misma tarjeta que en escritorio: cifra + desglose de fijos y
          deudas), con la barrita de comprometido/libre como acompañamiento — y sin la fila de
          "Saldo actual" del desglose de escritorio, que ya es el titular del hero de arriba. */}
      <div className="flex flex-col gap-4 lg:hidden">
        {canMovimientosManuales && (
          <SaldoProyectadoPanel
            title="Proyectado a fin de mes"
            projectedCents={projectedBalance}
            isPending={isProjectedPending}
            currentBalanceCents={currentBalanceCents}
            pendingFixedCount={pendingFixed.length}
            pendingFixedCents={pendingFixedTotal}
            savedFixedCents={savedFixedTotal}
            unpaidDebtsCount={unpaidDebtsCount}
            unpaidDebtsCents={misDeudasSummary.totalPendingCents}
            hidden={balanceHidden}
            showCurrentBalanceRow={false}
            bar
          />
        )}

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
                const urgency = fixedExpenseUrgency(parseISO(status.dueDate as string), today)
                return (
                  <li key={status.fe.id} className="flex items-center gap-2.5 py-1.5">
                    <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${urgencyDotClass[urgency]}`} />
                    <div className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-fg">{status.fe.name}</span>
                      {status.savedCents > 0 && (
                        <span className="block text-[11px] text-fg-muted">
                          <Money cents={Math.min(status.savedCents, status.remainingCents)} tone="dim" size="inline" hidden={balanceHidden} />{' '}
                          guardado
                        </span>
                      )}
                    </div>
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
            <div ref={movementsListRef} className="mt-3 flex flex-col gap-1">
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
              hint={canMovimientosManuales ? 'Arrancá con tu primer ingreso o gasto del día.' : 'Los movimientos salen de pagar tus fijos.'}
              action={
                canMovimientosManuales ? (
                  <Button onClick={() => setOpen(true)}>Nuevo movimiento</Button>
                ) : (
                  <Button onClick={() => setRegisterOpen(true)}>Registrar en un fijo</Button>
                )
              }
              className="mt-4"
            />
          )}
        </Panel>

        <div className="hidden flex-col gap-4 lg:flex">
          {canMisDeudas && (unpaidCards.length > 0 || unpaidStandalone.length > 0) && (
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
      {registerOpen && <RegisterFixedExpenseDialog open={registerOpen} onClose={() => setRegisterOpen(false)} />}
      {assignIncomeOpen && (
        <AssignIncomeDialog
          open={assignIncomeOpen}
          onClose={() => setAssignIncomeOpen(false)}
          cycleFrom={cycleFrom}
          cycleTo={cycleTo}
          cycleLabel={monthLabel}
        />
      )}
      {cuadrarOpen && <CuadrarSaldoDialog open={cuadrarOpen} onClose={() => setCuadrarOpen(false)} />}
    </div>
  )
}
