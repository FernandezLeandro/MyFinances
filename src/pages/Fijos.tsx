import { useMemo, useState, type ReactNode } from 'react'
import { format, getDate, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Plus } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CountUpMoney, Money, type MoneyTone } from '@/components/ui/Money'
import { CycleNav } from '@/components/ui/CycleNav'
import { IconSquare } from '@/components/ui/IconSquare'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCycle } from '@/lib/useCycle'
import { EASE_OUT_QUINT } from '@/lib/motion'
import { cycleOfLabel, cycleShortLabel, cycleThisLabel, projectionWindow } from '@/lib/cycle'
import { pendingBeforeCents } from '@/lib/projectedBalance'
import { useCan } from '@/features/access/useCan'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook, type ChipLook } from '@/features/categories/chip'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useFixedExpensePayments,
  useFixedExpenseSavings,
  useFixedExpenses,
  useProjectedBalanceRange,
  useUnmarkWithLegacyConfirm,
  type FixedExpense,
} from '@/features/fixed-expenses/api'
import { UnmarkBeforeAccountsDialog } from '@/features/fixed-expenses/UnmarkBeforeAccountsDialog'
import { cycleMonthsBounds, eligibleFixedExpenses } from '@/features/fixed-expenses/period'
import {
  compareFixedExpenses,
  cycleTotalCents,
  fixedExpenseAtPeriod,
  fixedExpenseStatusKey,
  fixedExpenseUrgency,
  sortByLastPaid,
  summarizeFixedExpenses,
  type FixedExpenseStatus,
  type FixedExpenseUrgency,
} from '@/features/fixed-expenses/aggregate'
import { FixedExpenseDetailDialog } from '@/features/fixed-expenses/FixedExpenseDetailDialog'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'
import { summarizeMisDeudas } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallmentsRange,
  useCreditPurchasePayments,
  useStandalonePurchases,
} from '@/features/credits/api'

// Pagar un fijo mueve la fila de su grupo al rail de «Pagados»: sin esto desaparece y reaparece de
// golpe. `height` (no `scale`) porque la fila tiene que ceder su lugar a las de abajo; `initial={false}`
// en cada `AnimatePresence` evita que se anime la carga de la pantalla o el cambio de ciclo.
const ROW_PRESENCE = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: EASE_OUT_QUINT },
} as const

// Igual para un panel entero, más `marginTop: -16` que cancela el `gap-4` de la columna mientras
// colapsa — sin eso el hueco de 16px desaparece de golpe al final de la salida.
const PANEL_PRESENCE = {
  initial: { opacity: 0, height: 0, marginTop: -16 },
  animate: { opacity: 1, height: 'auto', marginTop: 0 },
  exit: { opacity: 0, height: 0, marginTop: -16 },
  transition: { duration: 0.22, ease: EASE_OUT_QUINT },
} as const

/** `Panel` que entra y sale colapsando — para los grupos de la columna que aparecen y desaparecen al
 *  pagar. Va como hijo directo de un `AnimatePresence` (la `key` la pone quien lo usa). */
function PresencePanel({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <m.div {...PANEL_PRESENCE} transition={{ ...PANEL_PRESENCE.transition, delay }} className="overflow-hidden rounded-panel">
      <Panel>{children}</Panel>
    </m.div>
  )
}

/** Cuántos pagados se ven en el rail antes de «Ver los N restantes». */
const PAID_PREVIEW = 5

function FixedExpenseRow({
  status,
  chip,
  urgency,
  busy,
  hidden,
  showMonth,
  onPrimaryAction,
  onOpenDetail,
}: {
  status: FixedExpenseStatus
  chip: ChipLook
  /** Sólo tiene sentido para un fijo de una sola vez — una bolsa lo ignora (no vence). */
  urgency: FixedExpenseUrgency
  busy: boolean
  hidden: boolean
  /** Bloque 4 (FI-04/FI-06): con un ciclo semanal a caballo de dos meses, un mismo fijo puede
   *  aparecer dos veces — una instancia por mes (`status.period`). Sin aclarar de cuál mes es cada
   *  una, dos filas "Expensas" seguidas son indistinguibles. `cycle.months.length > 1` en el llamador. */
  showMonth: boolean
  onPrimaryAction: () => void
  onOpenDetail: () => void
}) {
  const { fe, period, paidCents, remainingCents, done, overspentCents, savedCents, dueDate } = status
  const monthLabel = showMonth ? format(parseISO(period), 'MMM', { locale: es }) : null
  // Con dos instancias del mismo fijo (una por mes), los `aria-label` que repiten `fe.name` dejan de
  // ser distintivos para un lector de pantalla — sumar el mes los vuelve a distinguir.
  const accessibleName = monthLabel ? `${fe.name} (${monthLabel})` : fe.name
  // L2 del QA: el día REAL de este mes, no `fe.due_day` crudo — un `due_day` 31 en septiembre (30
  // días) mostraba «Vence el 31» en vez de «Vence el 30».
  const dueDayThisMonth = dueDate ? getDate(parseISO(dueDate)) : (fe.due_day ?? '—')
  const overspent = overspentCents > 0
  const pct = fe.cents > 0 ? (paidCents / fe.cents) * 100 : 0
  // Bloque 3: sólo tiene sentido para un fijo de una vez todavía pendiente — una vez pagado ya no
  // hay nada que "juntar", y una bolsa ignora el guardado entero (`savedCents` viene en 0 ahí).
  const savedPct = !fe.is_recurring && !done && fe.cents > 0 ? Math.min((savedCents / fe.cents) * 100, 100) : 0

  return (
    <m.li {...ROW_PRESENCE} className="overflow-hidden">
      <div className="flex min-w-0 items-center gap-3 px-panel py-3.5 transition-colors duration-150 hover:bg-fill-subtle">
        {fe.is_recurring ? (
          // Una bolsa no se "tilda" — cada carga es un pago suelto, así que el control siempre agrega
          // una carga nueva (incluso ya completa: se puede seguir cargando nafta pasado el
          // presupuesto, sólo que no descuenta más del proyectado). Lo terminado se ve en la barra.
          <IconSquare onClick={onPrimaryAction} aria-label={`${accessibleName}: registrar carga`}>
            <Plus className="size-2.5" strokeWidth={1.5} aria-hidden />
          </IconSquare>
        ) : (
          <IconSquare
            active={done}
            disabled={busy}
            onClick={onPrimaryAction}
            aria-pressed={done}
            aria-label={done ? `${accessibleName}: pagado` : `${accessibleName}: marcar como pagado`}
          >
            {done && <Check className="size-3" strokeWidth={1.8} aria-hidden />}
          </IconSquare>
        )}

        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${accessibleName}: ver detalle`}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <CategoryChip size={28} {...chip} />
          <div className="min-w-0 flex-1">
            <p className={cn('truncate text-[13.5px] font-semibold', done && !overspent ? 'text-fg-muted' : 'text-fg')}>
              {fe.name}
              {monthLabel && <span className="font-normal text-fg-muted"> · {monthLabel}</span>}
            </p>

            {/* A 320px el badge de vencimiento (columna aparte, `shrink-0`) le dejaba tan poco lugar
                al nombre que se cortaba a dos letras (hallazgo del re-test de QA) — bajo `sm` se
                muestra acá, en su propia línea, y el badge de la derecha se oculta. */}
            {!fe.is_recurring && (
              <p className={cn('mt-0.5 text-[11.5px] sm:hidden', urgency === 'red' ? 'text-badge-red-fg' : 'text-fg-muted')}>
                {urgency === 'red' ? `Venció el ${dueDayThisMonth}` : `Vence el ${dueDayThisMonth}`}
              </p>
            )}

            {fe.is_recurring && (
              <div className="mt-1 flex items-center gap-2 lg:mt-1.5">
                {/* `shrink!`: a 320px con un importe de 7+ cifras, el ancho fijo de `wide` metía la barra
                    (y el «Completo») por debajo del monto de la derecha. */}
                <MiniProgress pct={pct} tone={overspent ? 'negative' : done ? 'accent' : 'muted'} size="wide" className="shrink!" />
                {overspent ? null : done ? (
                  // Bajo 360px no entra junto a la barra y un importe largo: la barra llena ya lo dice.
                  <span className="text-[12px] whitespace-nowrap text-fg-muted max-[359px]:hidden">Completo</span>
                ) : (
                  // En mobile esto sobra: el "Resta $X" de la derecha ya dice lo que importa, y sumar
                  // pagado+total acá era demasiada cifra para 390px (ver feedback de Lean).
                  <span className="hidden text-[12px] whitespace-nowrap text-fg-muted lg:inline">
                    <Money cents={paidCents} tone="dim" hidden={hidden} /> de <Money cents={fe.cents} tone="dim" hidden={hidden} />
                  </span>
                )}
              </div>
            )}

            {/* Bloque 3: mismo tratamiento visual que la barra de una bolsa, pero para "cuánto ya
                guardaste de lo que falta pagar" — sólo aparece si hay algo guardado, para no meter
                una barra en $0 en cada fijo de la lista. */}
            {savedPct > 0 && (
              <div className="mt-1 flex items-center gap-2 lg:mt-1.5">
                <MiniProgress pct={savedPct} tone="muted" size="wide" className="shrink!" />
                <span className="hidden text-[12px] whitespace-nowrap text-fg-muted lg:inline">
                  <Money cents={savedCents} tone="dim" hidden={hidden} /> guardado de <Money cents={fe.cents} tone="dim" hidden={hidden} />
                </span>
              </div>
            )}
          </div>
        </button>

        {/* Los fijos de una sola vez agrupados por vencimiento llevan el badge de urgencia — la bolsa
            no tiene fecha, así que no le corresponde. El wrapper (no `className` directo en `Badge`)
            es a propósito: `Badge` ya trae `inline-flex` sin condición, y en el CSS que genera
            Tailwind esa regla queda después de `.hidden` — le gana en la cascada y el badge no se
            ocultaba nunca por debajo de `sm` (hallazgo del re-test de QA a 320px: nombre cortado a
            "Ex…" y el vencimiento duplicado). Ocultar el wrapper entero esquiva ese choque. */}
        {!fe.is_recurring && (
          <div className="hidden shrink-0 sm:block">
            <Badge variant={urgency} className="whitespace-nowrap">
              {urgency === 'red' ? `Venció el ${dueDayThisMonth}` : `Vence el ${dueDayThisMonth}`}
            </Badge>
          </div>
        )}

        {/* Fijo único: se muestra lo que realmente salió (paidCents), no la plantilla — con un mes en
            curso ambos suelen coincidir, pero en un mes pasado pueden diferir. Bolsa: lo que resta
            mientras falte, lo cargado una vez completa. El exceso ya no va al lado de la barra (no
            entraba sin pisarla, y un importe grande la iba a pisar más todavía) — baja apilado acá
            debajo, en su propia línea, sin ancho fijo: si el número crece no tiene con qué chocar. */}
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Money cents={done ? paidCents : remainingCents} tone={done ? 'dim' : 'fg'} size="row" hidden={hidden} />
          {overspent && <Money cents={overspentCents} tone="negative" size="row" signed hidden={hidden} />}
        </div>
      </div>
    </m.li>
  )
}

/** Cabecera compartida por los tres grupos de vencimiento — título + hint + total de la sección. */
function SectionHeader({ title, hint, totalCents, hidden }: { title: string; hint?: string; totalCents: number; hidden: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-divider px-panel pt-5 pb-2">
      {/* FI-25 del QA: a 320px «Esta semana · los próximos 7 días» se partía en tres líneas junto al
          monto — el título no envuelve, y el hint (la parte menos necesaria del par) se esconde por
          debajo de `sm` en vez de forzar el ancho. */}
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="whitespace-nowrap font-display text-[14.5px] font-semibold text-fg">{title}</h2>
        {hint && <span className="hidden truncate text-[11.5px] text-fg-muted sm:inline">{hint}</span>}
      </div>
      <Money cents={totalCents} size="row" hidden={hidden} />
    </div>
  )
}

/** Una de las cifras chicas del hero (Pagado / Total del mes / Lo más próximo). `cents` en
 *  `undefined` la omite entera — pasa cuando no hay "lo más próximo" que mostrar. */
function HeroStat({
  label,
  cents,
  tone,
  hint,
  hidden,
}: {
  label: string
  cents: number | undefined
  tone: MoneyTone
  hint?: string
  hidden: boolean
}) {
  if (cents == null) return null
  return (
    // `min-w-0` + `truncate` en el hint: es el único texto de esta tarjeta que viene de un nombre
    // de usuario (el fijo más próximo a vencer) — sin esto, un nombre largo envuelve a varias
    // líneas y estira el alto de todo el hero, cuando esta columna no es la protagonista.
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} size="compact" tone={tone} hidden={hidden} className="mt-0.5" />
      {hint && (
        <p
          className={cn(
            'mt-0.5 truncate text-[11.5px]',
            tone === 'negative' ? 'text-negative' : 'text-fg-muted',
          )}
          title={hint}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

export function Fijos() {
  const { cycle, current, isCurrent, goToPrev, goToNext, config } = useCycle()
  const [formOpen, setFormOpen] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<FixedExpenseStatus | null>(null)
  // `period`: el mes de la fila que se abrió — el detalle de una bolsa lista sólo las cargas de ese mes.
  const [detailFixed, setDetailFixed] = useState<{ fe: FixedExpense; period: string } | null>(null)
  const [showPaused, setShowPaused] = useState(false)
  const [showAllPaid, setShowAllPaid] = useState(false)

  // `periods` son los meses que toca el ciclo mirado (eje B: pagos, ahorros y cuotas son mensuales
  // siempre — ver `src/lib/cycle.ts`). Mensual/quincenal nunca tocan más de uno; semanal (bloque 5)
  // puede tocar dos — de ahí que los 4 hooks de pagos/ahorros de abajo pidan una LISTA de períodos,
  // no uno solo. `horizonte` es DISTINTO: la ventana que decide qué se descuenta del saldo proyectado
  // (agujero #1 del plan) — coincide con el ciclo mirado salvo que se esté navegando a uno futuro, en
  // cuyo caso arranca antes, en el ciclo en curso.
  const periods = cycle.months
  // Ancla de bolsa para `summarizeFixedExpenses`: mientras se mira el ciclo que CONTIENE a hoy, usa
  // hoy mismo — mismo criterio "en vivo" que Hoy.tsx (que siempre pasa `today`). Importa cuando la
  // semana en curso cruza el borde del mes: `cycle.months[0]` quedaría en el mes anterior a hoy, lo
  // que cerraría de más una bolsa mensual que en realidad sigue vigente en el mes de hoy. Navegando a
  // otro ciclo (no el de hoy), sigue siendo el primer mes que toca, como siempre — no hay "hoy" al
  // que anclarse ahí.
  const month = isCurrent ? new Date() : parseISO(cycle.months[0])
  // El horizonte SÓLO alimenta el número grande del RPC (headline) — nunca la lista/desglose visible.
  // Motivo (encontrado al verificar contra la cuenta de prueba, no en el diseño original): cuando el
  // horizonte cruza a un mes anterior al que se está mirando, `rpc_projected_balance_range` acumula
  // CADA mes que toca por separado (un fijo impago desde septiembre Y su instancia de octubre suman
  // las dos, ver la migración `20260911030001`) — pero el cliente sólo tiene `payments` del mes que
  // se está mirando (`period`), así que no puede replicar esa acumulación sin traer pagos de varios
  // meses a la vez (la "plomería multi-mes" que el plan dejó para el bloque 5). Pasarle el horizonte
  // a `summarizeFixedExpenses`/`useCreditInstallmentsRange` haría que la lista de pendientes
  // SUBESTIME el headline en ese caso — exactamente el riesgo #1 del plan, con la señal invertida.
  // Con el CICLO mirado (nunca cruza de mes) el desglose es siempre internamente consistente consigo
  // mismo; sólo puede quedar por debajo del headline cuando hay algo impago de 2+ ciclos atrás — caso
  // raro, y preferible a que el desglose mienta pareciendo completo.
  const horizonte = useMemo(() => projectionWindow(cycle, current), [cycle, current])

  // FI-22: siempre `true` — un fijo pausado que ya tiene un pago/carga en el período sigue en
  // «Pagados» ese período (`summarizeFixedExpenses` lo filtra puertas adentro), no sólo cuando se
  // abre el panel «Pausados». `showPaused` sigue siendo sólo la visibilidad de ese panel.
  const { data: fixedExpenses, isPending: fixedPending, isError, refetch } = useFixedExpenses(true)
  const { data: payments, isPending: paymentsPending } = useFixedExpensePayments(periods)
  const { data: fixedSavings, isPending: savingsPending } = useFixedExpenseSavings(periods)
  // Pagos y guardados también: al cambiar de ciclo llegan después de los fijos, y sin esperarlos la
  // lista se veía un instante toda «pendiente» (dato falso) — con las filas animadas, ese destello
  // sería además un barajado. Un error de esas dos queda como antes: `isPending` es falso y se
  // muestra con lo que haya.
  const isPending = fixedPending || paymentsPending || savingsPending
  const { data: currentBalance } = useCurrentBalance()
  // HO-12 del QA de Hoy (D2): sin `mis-deudas` (Test), el proyectado no resta cuotas de tarjeta que
  // el plan no tiene dónde ver ni pagar — mismo criterio en Hoy y acá.
  const canMisDeudas = useCan('mis-deudas')
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalanceRange(
    horizonte.from,
    horizonte.to,
    canMisDeudas,
  )
  const { data: categories } = useCategories(true)
  const unmarkPayment = useUnmarkWithLegacyConfirm()

  const { data: cards } = useCreditCards()
  const { data: standalonePurchases } = useStandalonePurchases()
  const { data: installments } = useCreditInstallmentsRange(cycle.from, cycle.to)
  const { data: savings } = useCreditCardSavings(periods)
  const { data: cardPayments } = useCreditCardPayments(periods)
  const { data: purchasePayments } = useCreditPurchasePayments(periods)

  // Sin botón propio acá: el toggle vive en Hoy y comparte clave, así que ocultar el saldo ahí
  // también enmascara los importes de esta pantalla — un solo control, no uno por pantalla.
  const [balanceHidden] = useHiddenBalance('saldo-actual')

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
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
  // HO-03 del QA de Hoy: `unpaidCount` ya descuenta una tarjeta sin cuotas este período (antes
  // contaba como deuda impaga de $0 sólo por no tener pago).
  const unpaidDebtsCount = misDeudasSummary.unpaidCount

  // Todo lo elegible del período, activo o pausado — se usa para el estado vacío general y para el
  // aviso de pausados del rail. `summarizeFixedExpenses` hace este mismo filtro puertas adentro,
  // pero sólo para los activos: acá hace falta la lista completa. Los límites cubren TODOS los meses
  // que toca el ciclo (no sólo el de `month`, que puede ser distinto cuando `isCurrent` ancla a hoy)
  // — si no, un fijo que sólo se solapa con el segundo mes de una semana a caballo quedaría afuera.
  const eligibleAll = useMemo(() => {
    const bounds = cycleMonthsBounds(cycle.months)
    return eligibleFixedExpenses(fixedExpenses ?? [], bounds.end)
  }, [fixedExpenses, cycle])
  const pausedItems = [...eligibleAll].filter((fe) => !fe.is_active).sort(compareFixedExpenses)

  // `month` varía con `cycle`/`isCurrent` (ya en las deps) y con el reloj dentro del mismo render,
  // que no amerita recalcular — mismo criterio que `today` en Hoy.tsx.
  const { pending, done: doneItems, pendingTotalCents, savedTotalCents } = useMemo(
    () =>
      summarizeFixedExpenses(
        fixedExpenses ?? [],
        payments ?? [],
        month,
        new Date(),
        cycle,
        cycle.months,
        config.weekStartsOn,
        fixedSavings ?? [],
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixedExpenses, payments, fixedSavings, cycle, isCurrent, config],
  )
  const allStatuses = useMemo(() => [...pending, ...doneItems], [pending, doneItems])

  const bolsaStatuses = useMemo(
    // Empate por `period`: con una semana a caballo de dos meses, la misma bolsa puede tener una
    // instancia pagada (mes cerrado) y otra pendiente (mes en curso) — sin esto, `[...pending,
    // ...doneItems]` las desordena (todo lo pendiente antes que lo pagado), en vez de septiembre
    // antes que octubre.
    () => allStatuses.filter((s) => s.fe.is_recurring).sort((a, b) => compareFixedExpenses(a.fe, b.fe) || a.period.localeCompare(b.period)),
    [allStatuses],
  )
  const oneTimePending = useMemo(() => pending.filter((s) => !s.fe.is_recurring), [pending])
  const doneStatuses = useMemo(() => sortByLastPaid(allStatuses.filter((s) => s.done)), [allStatuses])
  // El rail muestra sólo los últimos pagados; el resto se despliega a pedido (con 20+ fijos la lista
  // entera era más alta que toda la columna principal).
  const visibleDone = showAllPaid ? doneStatuses : doneStatuses.slice(0, PAID_PREVIEW)
  const hiddenDoneCount = doneStatuses.length - PAID_PREVIEW

  const totalCount = allStatuses.length
  const doneCount = doneStatuses.length
  // FI-13: no es la suma de `fe.cents` (el importe ACTUAL de la plantilla) — ver `cycleTotalCents`.
  const totalCents = useMemo(() => allStatuses.reduce((acc, s) => acc + cycleTotalCents(s), 0), [allStatuses])
  const paidCentsTotal = useMemo(() => allStatuses.reduce((acc, s) => acc + s.paidCents, 0), [allStatuses])
  const paidPct = totalCents > 0 ? Math.min((paidCentsTotal / totalCents) * 100, 100) : 0

  // Agrupa los fijos de una sola vez pendientes por urgencia — mismo criterio que el widget de
  // Vencimientos de Hoy (`fixedExpenseUrgency`). Fuera del mes en curso "atrasado"/"esta semana" no
  // tienen sentido (se está mirando otro mes), así que todo cae en un solo grupo.
  const groups = useMemo(() => {
    const g: Record<FixedExpenseUrgency, FixedExpenseStatus[]> = { red: [], amber: [], neutral: [] }
    for (const s of oneTimePending) {
      const urgency = isCurrent && s.dueDate ? fixedExpenseUrgency(parseISO(s.dueDate), new Date()) : 'neutral'
      g[urgency].push(s)
    }
    // Por fecha real, no por día del mes crudo: con un ciclo semanal a caballo de dos meses, "día 2"
    // (del mes que viene) tiene que ordenar DESPUÉS de "día 25" (del mes en curso), no antes.
    for (const key of ['red', 'amber', 'neutral'] as const) {
      g[key].sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))
    }
    return g
  }, [oneTimePending, isCurrent])

  // El copy dependía fijo de "mes": con ciclo quincenal o semanal decía "el resto del mes"/"Fijos
  // del mes" aunque la pantalla mostrara sólo una quincena o una semana (cobertura nueva del re-test
  // de QA, junto con N2).
  const groupDefs = isCurrent
    ? ([
        { key: 'red', title: 'Atrasado', hint: 'ya venció' },
        { key: 'amber', title: 'Esta semana', hint: 'los próximos 7 días' },
        { key: 'neutral', title: 'Más adelante', hint: `el resto ${cycleOfLabel(cycle.kind)}` },
      ] as const)
    : ([{ key: 'neutral', title: `Fijos ${cycleOfLabel(cycle.kind)}`, hint: undefined } as const])

  // El más urgente entre los pendientes de una sola vez: el que vence más pronto, aunque ya haya
  // vencido — un atrasado siempre gana. Fuera del mes en curso, simplemente el que vence primero.
  const proximo = useMemo(() => {
    if (oneTimePending.length === 0) return null
    return [...oneTimePending].sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))[0]
  }, [oneTimePending])
  const proximoUrgency: FixedExpenseUrgency =
    proximo && isCurrent && proximo.dueDate ? fixedExpenseUrgency(parseISO(proximo.dueDate), new Date()) : 'neutral'
  // Sin el nombre del fijo: es texto de usuario sin límite de largo, y esta es una cifra
  // secundaria del hero — no vale la pena volver a pelear con el ancho por ella.
  // L2 del QA: el día real (`proximo.dueDate`, ya materializado/clampeado), no `fe.due_day` crudo.
  const proximoDay = proximo ? (proximo.dueDate ? getDate(parseISO(proximo.dueDate)) : (proximo.fe.due_day ?? '—')) : undefined
  const proximoHint = proximo ? (proximoUrgency === 'red' ? `Venció el ${proximoDay}` : `Vence el ${proximoDay}`) : undefined

  // `pending`, no «sin recurrentes ni fijos únicos pendientes»: los recurrentes completos siguen en su
  // panel (se puede seguir cargando), y antes eso escondía «Todo pagado» aunque no faltara nada.
  const nothingPending = pending.length === 0

  function openNew() {
    setFormOpen(true)
  }

  function handlePrimaryAction(status: FixedExpenseStatus) {
    if (status.fe.is_recurring) {
      // Siempre suma una carga nueva — nunca "desmarca" (para eso está el botón de quitar en el
      // historial de detalle, que sí sabe cuál de varias cargas sacar).
      setMarkingPaid(status)
      return
    }
    if (status.payments.length > 0) {
      // Desmarcar sigue siendo un toque, sin diálogo: es reversible y es el control más usado de
      // la pantalla. Sólo el camino "no pagado → pagado" necesita preguntar el importe.
      unmarkPayment.unmarkPayment(status.payments[0].id)
    } else {
      setMarkingPaid(status)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        {/* Mobile: título + píldora de mes en una fila. Ya no hay tabs Fijos/Mis Deudas/Me Deben
            acá — cada pantalla se navega desde el nav general, no cruzando entre sí. FI-25 del QA:
            `flex-wrap` + `whitespace-nowrap` en el título — con la etiqueta más larga de una semana a
            caballo de dos meses (FI-20, "28 sep – 4 oct"), a 320px la píldora ya no entra al lado del
            título sin envolver ninguno de los dos por la mitad. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 lg:hidden">
          <h1 className="whitespace-nowrap font-display text-figure font-semibold">Gastos fijos</h1>
          <CycleNav cycle={cycle} onPrev={goToPrev} onNext={goToNext} />
        </div>

        <div className="hidden lg:block">
          <CycleNav cycle={cycle} onPrev={goToPrev} onNext={goToNext} />
          <h1 className="mt-2 font-display text-figure font-semibold">Gastos fijos</h1>
        </div>

        {/* Visible en las dos resoluciones: el FAB de la isla abre "nuevo movimiento", no crea un fijo.
            Los pausados se ven desde su panel del rail («N fijos pausados · Ver»), que aparece sólo
            cuando hay alguno — un botón fijo acá ocupaba media fila en mobile para algo raro. */}
        <Button
          size="compact"
          icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}
          onClick={openNew}
          className="w-full lg:w-auto"
        >
          Nuevo fijo
        </Button>
      </header>

      {isError ? (
        <Panel className="px-panel py-10">
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="flex flex-col gap-3 p-panel">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
            </Panel>
            <Panel className="flex flex-col gap-1 px-panel py-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-5 shrink-0" />
                  <Skeleton className="size-7 shrink-0 rounded-[8px]" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </Panel>
          </div>
          <Skeleton className="h-48 w-full rounded-panel" />
        </div>
      ) : eligibleAll.length === 0 ? (
        <Panel>
          <EmptyState
            glyph="◷"
            title="Todavía no cargaste gastos fijos"
            hint="Alquiler, servicios, suscripciones… lo que se repite todos los meses."
            action={<Button onClick={openNew}>Nuevo fijo</Button>}
          />
        </Panel>
      ) : (
        // `min-w-0` en las dos columnas: sin eso, un nombre largo sin espacios empuja el ancho
        // mínimo de la columna entera (fr no la deja encoger) y agranda todas las tarjetas de esa
        // columna, no sólo la que tiene el texto largo — el truncate de más abajo no alcanza si el
        // contenedor nunca se deja achicar.
        // `key={cycle.from}`: al navegar de ciclo se remonta todo, así ni las filas ni el número del
        // hero se animan entre ciclos — sólo cuando algo cambia DENTRO del ciclo que se mira.
        <div key={cycle.from} className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="flex flex-col gap-5 p-panel-tight lg:flex-row lg:items-center lg:gap-9 lg:p-6">
              {/* Mobile: sin el "de $total" — con el hero ya alcanza, y es una cifra más que
                  competir por lugar en 390px. `size="hero"` (el mismo clamp del saldo de Hoy) en
                  vez de `total` fijo: si el número crece, se achica solo en vez de desbordar. */}
              <div className="lg:hidden">
                <p className="eyebrow">Falta pagar</p>
                <CountUpMoney cents={pendingTotalCents} size="hero" hidden={balanceHidden} className="mt-1" />
                <MiniProgress pct={paidPct} tone="accent" size="bar" className="mt-3" />
                {/* `flex-wrap`, no `grid-cols-2`: con saldos grandes una cifra no entra en una
                    columna fija de la mitad y no tiene dónde envolver (los números no cortan) — así
                    la que no entra baja entera a su propio renglón en vez de pisar a la de al lado. */}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <HeroStat
                    label="Pagado"
                    cents={paidCentsTotal}
                    tone="accent"
                    hint={`${doneCount} de ${totalCount} fijos`}
                    hidden={balanceHidden}
                  />
                  <HeroStat
                    label="Lo más próximo"
                    cents={proximo?.remainingCents}
                    tone={proximoUrgency === 'red' ? 'negative' : 'fg'}
                    hint={proximoHint}
                    hidden={balanceHidden}
                  />
                </div>
              </div>

              {/* Escritorio: mismo patrón que el resumen de Movimientos — cifra principal + divisor
                  + el resto, todo centrado verticalmente en vez de alineado al fondo. */}
              <div className="hidden flex-none lg:block">
                <p className="eyebrow">Falta pagar en {cycleShortLabel(cycle)}</p>
                <CountUpMoney cents={pendingTotalCents} size="total" className="mt-1" hidden={balanceHidden} />
              </div>
              <div className="hidden h-14 w-px shrink-0 bg-divider lg:block" />
              <div className="hidden min-w-0 flex-1 lg:block">
                <MiniProgress pct={paidPct} tone="accent" size="bar" />
                {/* `flex-wrap`: con saldos grandes (7+ cifras) un tercio fijo de columna no
                    alcanza y los números, que no cortan, se pisan con la columna de al lado — acá
                    la que no entra en la fila baja entera a su propio renglón. */}
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
                  <HeroStat
                    label="Pagado"
                    cents={paidCentsTotal}
                    tone="accent"
                    hint={`${doneCount} de ${totalCount} fijos`}
                    hidden={balanceHidden}
                  />
                  <HeroStat
                    label={`Total ${cycleOfLabel(cycle.kind)}`}
                    cents={totalCents}
                    tone="fg"
                    hint={pausedItems.length > 0 ? `${pausedItems.length} pausado${pausedItems.length === 1 ? '' : 's'} aparte` : undefined}
                    hidden={balanceHidden}
                  />
                  <HeroStat
                    label="Lo más próximo"
                    cents={proximo?.remainingCents}
                    tone={proximoUrgency === 'red' ? 'negative' : 'fg'}
                    hint={proximoHint}
                    hidden={balanceHidden}
                  />
                </div>
              </div>
            </Panel>

            <AnimatePresence initial={false}>
              {nothingPending && (
                // Arriba de todo: es la noticia del ciclo, y los recurrentes completos siguen abajo.
                // `delay`: espera a que el último grupo termine de colapsar, para no ver las dos
                // tarjetas moviéndose a la vez. Con `totalCount === 0` (nada elegible este ciclo) no
                // hay nada que celebrar: queda el aviso plano.
                <PresencePanel key="nothing" delay={0.15}>
                  {totalCount > 0 ? (
                    <div className="flex items-center gap-3 px-panel py-5">
                      <m.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', duration: 0.45, bounce: 0.3, delay: 0.15 }}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
                      >
                        <Check className="size-4" strokeWidth={2.2} aria-hidden />
                      </m.span>
                      <div className="min-w-0">
                        <p className="font-display text-[14.5px] font-semibold text-fg">Todo pagado</p>
                        <p className="mt-0.5 text-[12px] text-fg-muted">
                          {doneCount} de {totalCount} fijos
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="px-panel py-5 text-[13px] text-fg-muted">No tenés nada por pagar {cycleThisLabel(cycle.kind)}.</p>
                  )}
                </PresencePanel>
              )}

              {bolsaStatuses.length > 0 && (
                <PresencePanel key="bolsas">
                  {/* El total vuelve a estar pegado al título (antes vivía solo, empujado al borde
                      derecho por el `justify-between`) — el hint sale en mobile, y a la derecha queda
                      "Resta" como encabezado de columna, alineado con el importe de cada fila (mismo
                      `w-24` que el `Money` de abajo) en vez de repetirse fila por fila. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-divider px-panel pt-5 pb-2">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h2 className="font-display text-[14.5px] font-semibold text-fg">Recurrentes</h2>
                      <span className="hidden text-[11.5px] text-fg-muted md:inline">se cargan durante el período</span>
                    </div>
                    {/* `hidden` entero por debajo de 768px, no sólo el texto: ahí no hay una columna de
                        valores prolija contra la cual alinearlo (cada fila apila su propio importe y
                        el exceso, si hay, con anchos distintos) — dejar la etiqueta sin nada que
                        alinear rompía el header, y reservar el ancho igual desalineaba el resto. */}
                    <span className="hidden text-right text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase md:block md:w-24 md:shrink-0">
                      Resta
                    </span>
                  </div>
                  <ul className="pb-3">
                    <AnimatePresence initial={false}>
                      {bolsaStatuses.map((status) => (
                        <FixedExpenseRow
                          key={fixedExpenseStatusKey(status)}
                          status={status}
                          chip={chipLook(categoryById.get(status.fe.category_id ?? ''))}
                          urgency="neutral"
                          busy={unmarkPayment.isPending}
                          hidden={balanceHidden}
                          showMonth={cycle.months.length > 1}
                          onPrimaryAction={() => handlePrimaryAction(status)}
                          onOpenDetail={() => setDetailFixed({ fe: status.fe, period: status.period })}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                </PresencePanel>
              )}

              {groupDefs.map((g) => {
                const items = groups[g.key]
                if (items.length === 0) return null
                const groupTotalCents = items.reduce((acc, s) => acc + s.remainingCents, 0)
                return (
                  <PresencePanel key={g.key}>
                    <SectionHeader title={g.title} hint={g.hint} totalCents={groupTotalCents} hidden={balanceHidden} />
                    <ul className="pb-3">
                      <AnimatePresence initial={false}>
                        {items.map((status) => (
                          <FixedExpenseRow
                            key={fixedExpenseStatusKey(status)}
                            status={status}
                            chip={chipLook(categoryById.get(status.fe.category_id ?? ''))}
                            urgency={g.key}
                            busy={unmarkPayment.isPending}
                            hidden={balanceHidden}
                            showMonth={cycle.months.length > 1}
                            onPrimaryAction={() => handlePrimaryAction(status)}
                            onOpenDetail={() => setDetailFixed({ fe: status.fe, period: status.period })}
                          />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </PresencePanel>
                )
              })}
            </AnimatePresence>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SaldoProyectadoPanel
              cycleKind={cycle.kind}
              projectedCents={projectedBalance}
              isPending={isProjectedPending}
              currentBalanceCents={currentBalance ?? 0}
              pendingFixedCount={pending.length}
              pendingFixedCents={pendingTotalCents}
              savedFixedCents={savedTotalCents}
              unpaidDebtsCount={canMisDeudas ? unpaidDebtsCount : 0}
              unpaidDebtsCents={canMisDeudas ? misDeudasSummary.totalPendingCents : 0}
              // FI-08: en un período futuro, lo que sigue impago del período en curso — 0 (sin fila)
              // en el actual, donde el desglose ya cierra solo.
              pendingBeforeCents={pendingBeforeCents(
                currentBalance ?? 0,
                pendingTotalCents,
                misDeudasSummary.totalPendingCents,
                projectedBalance,
              )}
              hidden={balanceHidden}
            />

            <AnimatePresence initial={false}>
              {doneStatuses.length > 0 && (
                <PresencePanel key="pagados">
                  <div className="flex items-baseline justify-between px-panel pt-5 pb-1">
                    <p className="eyebrow">Pagados {cycleThisLabel(cycle.kind)}</p>
                    <Money cents={paidCentsTotal} size="row" hidden={balanceHidden} />
                  </div>
                  <ul className={cn('flex min-w-0 flex-col px-panel', hiddenDoneCount > 0 ? 'pb-1' : 'pb-5')}>
                    <AnimatePresence initial={false}>
                      {visibleDone.map((s) => {
                        // Bloque 4: con `cycle.months.length > 1` un mismo fijo puede tener una
                        // instancia pagada (mes cerrado) y otra pendiente (mes en curso) a la vez — el
                        // mes acá desambigua cuál de las dos es esta fila.
                        const monthLabel = cycle.months.length > 1 ? format(parseISO(s.period), 'MMM', { locale: es }) : null
                        const accessibleName = monthLabel ? `${s.fe.name} (${monthLabel})` : s.fe.name
                        return (
                          <m.li key={fixedExpenseStatusKey(s)} {...ROW_PRESENCE} className="overflow-hidden">
                            <div className="flex min-w-0 items-center gap-2.5 py-[7px]">
                              {/* Una bolsa completa no se "despaga" (sigue siendo un + que suma otra carga,
                                  en su propia sección) — sólo el fijo único puede desmarcarse acá. */}
                              {s.fe.is_recurring ? (
                                <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse">
                                  <Check className="size-2.5" strokeWidth={2} aria-hidden />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handlePrimaryAction(s)}
                                  disabled={unmarkPayment.isPending}
                                  aria-label={`${accessibleName}: quitar pago`}
                                  className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse transition-opacity duration-150 hover:opacity-70 disabled:opacity-50"
                                >
                                  <Check className="size-2.5" strokeWidth={2} aria-hidden />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setDetailFixed({ fe: s.fe, period: s.period })}
                                aria-label={`${accessibleName}: ver detalle`}
                                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                              >
                                <CategoryChip size={20} {...chipLook(categoryById.get(s.fe.category_id ?? ''))} />
                                {/* `flex-wrap`: a 320px con un importe largo, la pastilla al lado dejaba
                                    el nombre en «Co…» — así baja a su propio renglón cuando no entra. */}
                                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="min-w-0 truncate text-[12.5px] text-fg-secondary">
                                    {s.fe.name}
                                    {monthLabel && <span className="text-fg-muted"> · {monthLabel}</span>}
                                  </span>
                                  {s.fe.is_recurring && <Badge variant="neutral">Recurrente</Badge>}
                                </span>
                              </button>
                              <Money cents={s.paidCents} tone="dim" size="row" hidden={balanceHidden} />
                            </div>
                          </m.li>
                        )
                      })}
                    </AnimatePresence>
                  </ul>
                  {hiddenDoneCount > 0 && (
                    <div className="px-panel pb-5">
                      <button
                        type="button"
                        onClick={() => setShowAllPaid((v) => !v)}
                        aria-expanded={showAllPaid}
                        className="py-1.5 text-[12.5px] font-semibold text-accent transition-opacity duration-150 hover:opacity-70"
                      >
                        {showAllPaid ? 'Ver menos' : hiddenDoneCount === 1 ? 'Ver 1 más' : `Ver los ${hiddenDoneCount} restantes`}
                      </button>
                    </div>
                  )}
                </PresencePanel>
              )}
            </AnimatePresence>

            {pausedItems.length > 0 && (
              <Panel className="px-[22px] py-[18px]">
                <button
                  type="button"
                  onClick={() => setShowPaused((v) => !v)}
                  aria-pressed={showPaused}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-[12.5px] text-fg-secondary">
                    {pausedItems.length} fijo{pausedItems.length === 1 ? '' : 's'} pausado{pausedItems.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-[12.5px] font-semibold text-accent">{showPaused ? 'Ocultar' : 'Ver'}</span>
                </button>
                <AnimatePresence initial={false}>
                  {showPaused && (
                    <m.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT_QUINT }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-3 flex flex-col gap-2 border-t border-divider pt-3">
                        {pausedItems.map((fe) => (
                          <li key={fe.id} className="flex min-w-0 items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const period = format(startOfMonth(month), 'yyyy-MM-dd')
                                setDetailFixed({ fe: fixedExpenseAtPeriod(fe, period), period })
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <CategoryChip size={20} archived {...chipLook(categoryById.get(fe.category_id ?? ''))} />
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">{fe.name}</span>
                            </button>
                            <Money cents={fe.cents} tone="dim" size="row" hidden={balanceHidden} />
                          </li>
                        ))}
                      </ul>
                    </m.div>
                  )}
                </AnimatePresence>
              </Panel>
            )}
          </div>
        </div>
      )}

      {formOpen && <FixedExpenseFormDialog open={formOpen} onClose={() => setFormOpen(false)} />}
      {markingPaid && (
        <MarkPaidDialog
          open={!!markingPaid}
          onClose={() => setMarkingPaid(null)}
          fixedExpense={markingPaid.fe}
          // Bloque 4: `markingPaid.period` YA es el mes de ESTA instancia — `summarizeFixedExpenses`
          // ahora genera una por (fijo, mes), así que no hace falta rederivarlo del `dueDate` ni de
          // `month` (el ancla "en vivo" que arma esta pantalla más abajo).
          period={markingPaid.period}
          alreadyPaidCents={markingPaid.paidCents}
          alreadySavedCents={markingPaid.savedCents}
          alreadySavedMovementCents={markingPaid.savedMovementCents}
          dueDate={markingPaid.dueDate}
        />
      )}
      {detailFixed && (
        <FixedExpenseDetailDialog open={!!detailFixed} onClose={() => setDetailFixed(null)} fixedExpense={detailFixed.fe} period={detailFixed.period} />
      )}
      <UnmarkBeforeAccountsDialog
        open={unmarkPayment.confirmOpen}
        busy={unmarkPayment.isPending}
        onClose={unmarkPayment.cancelConfirm}
        onConfirm={unmarkPayment.confirmForce}
      />
    </div>
  )
}
