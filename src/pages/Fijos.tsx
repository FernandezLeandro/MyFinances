import { useMemo, useState } from 'react'
import { addMonths, endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Pause, Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { MonthNav } from '@/components/ui/MonthNav'
import { IconSquare } from '@/components/ui/IconSquare'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useFixedExpensePayments,
  useFixedExpenses,
  useProjectedBalance,
  useUnmarkFixedExpensePayment,
  type FixedExpense,
} from '@/features/fixed-expenses/api'
import { eligibleFixedExpenses } from '@/features/fixed-expenses/period'
import {
  compareFixedExpenses,
  fixedExpenseUrgency,
  summarizeFixedExpenses,
  type FixedExpenseStatus,
  type FixedExpenseUrgency,
} from '@/features/fixed-expenses/aggregate'
import { FixedExpenseDetailDialog } from '@/features/fixed-expenses/FixedExpenseDetailDialog'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { MarkPaidDialog } from '@/features/fixed-expenses/MarkPaidDialog'
import { PendientesTabs } from '@/components/PendientesTabs'
import { summarizeMisDeudas } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallments,
  useCreditPurchasePayments,
  useStandalonePurchases,
} from '@/features/credits/api'

function FixedExpenseRow({
  status,
  categoryColor,
  urgency,
  busy,
  hidden,
  onPrimaryAction,
  onOpenDetail,
}: {
  status: FixedExpenseStatus
  categoryColor: string | undefined
  /** Sólo tiene sentido para un fijo de una sola vez — una bolsa lo ignora (no vence). */
  urgency: FixedExpenseUrgency
  busy: boolean
  hidden: boolean
  onPrimaryAction: () => void
  onOpenDetail: () => void
}) {
  const { fe, paidCents, remainingCents, done, overspentCents } = status
  const overspent = overspentCents > 0
  const pct = fe.cents > 0 ? (paidCents / fe.cents) * 100 : 0

  return (
    <li className="flex min-w-0 items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-fill-subtle">
      {fe.is_recurring ? (
        // Una bolsa no se "tilda" — cada carga es un pago suelto, así que el control siempre agrega
        // una carga nueva (incluso ya completa: se puede seguir cargando nafta pasado el
        // presupuesto, sólo que no descuenta más del proyectado). Lo terminado se ve en la barra.
        <IconSquare onClick={onPrimaryAction} aria-label={`${fe.name}: registrar carga`}>
          <Plus className="size-2.5" strokeWidth={1.5} aria-hidden />
        </IconSquare>
      ) : (
        <IconSquare
          active={done}
          disabled={busy}
          onClick={onPrimaryAction}
          aria-pressed={done}
          aria-label={done ? `${fe.name}: pagado` : `${fe.name}: marcar como pagado`}
        >
          {done && <Check className="size-3" strokeWidth={1.8} aria-hidden />}
        </IconSquare>
      )}

      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${fe.name}: ver detalle`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[13.5px] font-semibold', done && !overspent ? 'text-fg-muted' : 'text-fg')}>
            {fe.name}
          </p>

          {fe.is_recurring && (
            <div className="mt-1 flex items-center gap-2 lg:mt-1.5">
              <MiniProgress pct={pct} tone={overspent ? 'negative' : done ? 'accent' : 'muted'} />
              {overspent ? (
                <span className="text-[12px] whitespace-nowrap text-negative">
                  Te pasaste <Money cents={overspentCents} tone="negative" hidden={hidden} />
                </span>
              ) : done ? (
                <span className="text-[12px] whitespace-nowrap text-fg-muted">Completo</span>
              ) : (
                // En mobile esto sobra: el "Resta $X" de la derecha ya dice lo que importa, y sumar
                // pagado+total acá era demasiada cifra para 390px (ver feedback de Lean).
                <span className="hidden text-[12px] whitespace-nowrap text-fg-muted lg:inline">
                  <Money cents={paidCents} tone="dim" hidden={hidden} /> de <Money cents={fe.cents} tone="dim" hidden={hidden} />
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* Los fijos de una sola vez agrupados por vencimiento llevan el badge de urgencia — la bolsa
          no tiene fecha, así que no le corresponde. */}
      {!fe.is_recurring && (
        <Badge variant={urgency} className="shrink-0 whitespace-nowrap">
          {urgency === 'red' ? `Venció el ${fe.due_day ?? '—'}` : `Vence el ${fe.due_day ?? '—'}`}
        </Badge>
      )}

      {/* Bolsa sin completar: el importe de la derecha por sí solo no dice si es lo pagado o lo que
          falta — "Resta" lo aclara ("Falta" pide un sujeto que acá no está). Completa o en un fijo
          único no hace falta: "Completo" ya lo dice, y el único siempre muestra su total. `shrink-0`
          en los dos: sin eso, en 390px terminan achicándose hasta pisarse con el nombre. */}
      {fe.is_recurring && !done && !overspent && (
        <span className="shrink-0 text-[11.5px] whitespace-nowrap text-fg-muted">Resta</span>
      )}

      {/* Fijo único: se muestra lo que realmente salió (paidCents), no la plantilla — con un mes en
          curso ambos suelen coincidir, pero en un mes pasado pueden diferir. Bolsa: lo que resta
          mientras falte, lo cargado una vez completa (el excedente ya se ve en la línea de arriba). */}
      <Money
        cents={done ? paidCents : remainingCents}
        tone={done ? 'dim' : 'fg'}
        size="row"
        hidden={hidden}
        className="w-24 shrink-0 justify-end"
      />
    </li>
  )
}

/** Cabecera compartida por los tres grupos de vencimiento — título + hint + total de la sección. */
function SectionHeader({ title, hint, totalCents, hidden }: { title: string; hint?: string; totalCents: number; hidden: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-divider px-6 pt-5 pb-2">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[14.5px] font-semibold text-fg">{title}</h2>
        {hint && <span className="text-[11.5px] text-fg-muted">{hint}</span>}
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
  const [month, setMonth] = useState(() => new Date())
  const [formOpen, setFormOpen] = useState(false)
  const [markingPaid, setMarkingPaid] = useState<FixedExpenseStatus | null>(null)
  const [detailFixed, setDetailFixed] = useState<FixedExpense | null>(null)
  const [showPaused, setShowPaused] = useState(false)

  const period = format(startOfMonth(month), 'yyyy-MM-dd')
  const isCurrentMonth = isSameMonth(month, new Date())

  const { data: fixedExpenses, isPending, isError, refetch } = useFixedExpenses(showPaused)
  const { data: payments } = useFixedExpensePayments(period)
  const { data: currentBalance } = useCurrentBalance()
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)
  const { data: categories } = useCategories(true)
  const unmarkPayment = useUnmarkFixedExpensePayment()

  const { data: cards } = useCreditCards()
  const { data: standalonePurchases } = useStandalonePurchases()
  const { data: installments } = useCreditInstallments(period)
  const { data: savings } = useCreditCardSavings(period)
  const { data: cardPayments } = useCreditCardPayments(period)
  const { data: purchasePayments } = useCreditPurchasePayments(period)

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
  const unpaidDebtsCount =
    misDeudasSummary.perCard.filter((c) => !c.paid).length + misDeudasSummary.standalone.filter((s) => !s.paid).length

  // Todo lo elegible del período, activo o pausado — se usa para el estado vacío general y para el
  // aviso de pausados del rail. `summarizeFixedExpenses` hace este mismo filtro puertas adentro,
  // pero sólo para los activos: acá hace falta la lista completa.
  const eligibleAll = useMemo(
    () => eligibleFixedExpenses(fixedExpenses ?? [], startOfMonth(month), endOfMonth(month)),
    [fixedExpenses, month],
  )
  const pausedItems = [...eligibleAll].filter((fe) => !fe.is_active).sort(compareFixedExpenses)

  const { pending, done: doneItems, pendingTotalCents } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], payments ?? [], month, new Date()),
    [fixedExpenses, payments, month],
  )
  const allStatuses = useMemo(() => [...pending, ...doneItems], [pending, doneItems])

  const bolsaStatuses = useMemo(
    () => allStatuses.filter((s) => s.fe.is_recurring).sort((a, b) => compareFixedExpenses(a.fe, b.fe)),
    [allStatuses],
  )
  const oneTimePending = useMemo(() => pending.filter((s) => !s.fe.is_recurring), [pending])
  const doneStatuses = useMemo(() => allStatuses.filter((s) => s.done), [allStatuses])

  const totalCount = allStatuses.length
  const doneCount = doneStatuses.length
  const totalCents = useMemo(() => allStatuses.reduce((acc, s) => acc + s.fe.cents, 0), [allStatuses])
  const paidCentsTotal = useMemo(() => allStatuses.reduce((acc, s) => acc + s.paidCents, 0), [allStatuses])
  const paidPct = totalCents > 0 ? Math.min((paidCentsTotal / totalCents) * 100, 100) : 0

  const bolsaTotalCents = useMemo(() => bolsaStatuses.reduce((acc, s) => acc + s.fe.cents, 0), [bolsaStatuses])
  const bolsaPaidCents = useMemo(() => bolsaStatuses.reduce((acc, s) => acc + s.paidCents, 0), [bolsaStatuses])

  // Agrupa los fijos de una sola vez pendientes por urgencia — mismo criterio que el widget de
  // Vencimientos de Hoy (`fixedExpenseUrgency`). Fuera del mes en curso "atrasado"/"esta semana" no
  // tienen sentido (se está mirando otro mes), así que todo cae en un solo grupo.
  const groups = useMemo(() => {
    const g: Record<FixedExpenseUrgency, FixedExpenseStatus[]> = { red: [], amber: [], neutral: [] }
    for (const s of oneTimePending) {
      const urgency = isCurrentMonth && s.fe.due_day != null ? fixedExpenseUrgency(s.fe.due_day, new Date()) : 'neutral'
      g[urgency].push(s)
    }
    for (const key of ['red', 'amber', 'neutral'] as const) {
      g[key].sort((a, b) => (a.fe.due_day ?? 32) - (b.fe.due_day ?? 32))
    }
    return g
  }, [oneTimePending, isCurrentMonth])

  const groupDefs = isCurrentMonth
    ? ([
        { key: 'red', title: 'Atrasado', hint: 'ya venció' },
        { key: 'amber', title: 'Esta semana', hint: 'los próximos 7 días' },
        { key: 'neutral', title: 'Más adelante', hint: 'el resto del mes' },
      ] as const)
    : ([{ key: 'neutral', title: 'Fijos del mes', hint: undefined } as const])

  // El más urgente entre los pendientes de una sola vez: el que vence más pronto, aunque ya haya
  // vencido — un atrasado siempre gana. Fuera del mes en curso, simplemente el que vence primero.
  const proximo = useMemo(() => {
    if (oneTimePending.length === 0) return null
    return [...oneTimePending].sort((a, b) => (a.fe.due_day ?? 32) - (b.fe.due_day ?? 32))[0]
  }, [oneTimePending])
  const proximoUrgency: FixedExpenseUrgency =
    proximo && isCurrentMonth && proximo.fe.due_day != null ? fixedExpenseUrgency(proximo.fe.due_day, new Date()) : 'neutral'
  // Sin el nombre del fijo: es texto de usuario sin límite de largo, y esta es una cifra
  // secundaria del hero — no vale la pena volver a pelear con el ancho por ella.
  const proximoHint = proximo ? (proximoUrgency === 'red' ? `Venció el ${proximo.fe.due_day}` : `Vence el ${proximo.fe.due_day}`) : undefined

  const nothingPending = bolsaStatuses.length === 0 && oneTimePending.length === 0

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
      unmarkPayment.mutate({ paymentId: status.payments[0].id })
    } else {
      setMarkingPaid(status)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        {/* Mobile: título + píldora de mes en una fila, los tabs Fijos/Mis Deudas/Me Deben debajo. */}
        <div className="flex flex-col gap-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-figure font-semibold">Gastos fijos</h1>
            <MonthNav
              label={format(month, 'MMMM yyyy', { locale: es })}
              mobileLabel={format(month, 'MMMM', { locale: es })}
              onPrev={() => setMonth((m) => subMonths(m, 1))}
              onNext={() => setMonth((m) => addMonths(m, 1))}
            />
          </div>
          <PendientesTabs />
        </div>

        <div className="hidden lg:block">
          <MonthNav
            label={format(month, 'MMMM yyyy', { locale: es })}
            onPrev={() => setMonth((m) => subMonths(m, 1))}
            onNext={() => setMonth((m) => addMonths(m, 1))}
          />
          <h1 className="mt-2 font-display text-figure font-semibold">Gastos fijos</h1>
          <div className="mt-3">
            <PendientesTabs />
          </div>
        </div>

        {/* Sólo escritorio: en mobile el `+` de la isla ya cubre "nuevo fijo", y Pausados vive en el
            aviso del rail más abajo. */}
        <div className="hidden items-center gap-2 lg:flex">
          <Button
            variant="outline"
            size="compact"
            onClick={() => setShowPaused((v) => !v)}
            aria-pressed={showPaused}
            icon={<Pause className="size-3" fill="currentColor" strokeWidth={1.6} aria-hidden />}
            className={cn(showPaused && 'border-border-strong bg-fill-subtle text-fg')}
          >
            Pausados
          </Button>
          <Button size="compact" icon={<span className="text-base leading-none">+</span>} onClick={openNew}>
            Nuevo fijo
          </Button>
        </div>
      </header>

      {isError ? (
        <Panel className="px-6 py-10">
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="flex flex-col gap-3 p-6">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
            </Panel>
            <Panel className="flex flex-col gap-1 px-6 py-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-5 shrink-0" />
                  <Skeleton className="size-2 shrink-0 rounded-full" />
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="flex flex-col gap-5 p-[18px] lg:flex-row lg:items-center lg:gap-9 lg:p-6">
              {/* Mobile: sin el "de $total" — con el hero ya alcanza, y es una cifra más que
                  competir por lugar en 390px. `size="hero"` (el mismo clamp del saldo de Hoy) en
                  vez de `total` fijo: si el número crece, se achica solo en vez de desbordar. */}
              <div className="lg:hidden">
                <p className="eyebrow">Falta pagar</p>
                <Money cents={pendingTotalCents} size="hero" hidden={balanceHidden} className="mt-1" />
                <div className="mt-3 flex h-[7px] overflow-hidden rounded-full bg-fill-subtle">
                  <div className="h-full bg-accent" style={{ width: `${paidPct}%` }} />
                  <div className="h-full bg-negative" style={{ width: `${100 - paidPct}%` }} />
                </div>
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
                <p className="eyebrow">Falta pagar en {format(month, 'MMMM', { locale: es })}</p>
                <Money cents={pendingTotalCents} size="total" className="mt-1" hidden={balanceHidden} />
              </div>
              <div className="hidden h-14 w-px shrink-0 bg-divider lg:block" />
              <div className="hidden min-w-0 flex-1 lg:block">
                <div className="flex h-2 overflow-hidden rounded-full bg-fill-subtle">
                  <div className="h-full bg-accent" style={{ width: `${paidPct}%` }} />
                  <div className="h-full bg-negative" style={{ width: `${100 - paidPct}%` }} />
                </div>
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
                    label="Total del mes"
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

            {bolsaStatuses.length > 0 && (
              <Panel>
                {/* El hint ("se cargan durante el mes") sale en mobile: título + total ya casi no
                    entran en una fila a 390px, y es el detalle menos importante de los tres. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-divider px-6 pt-5 pb-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-display text-[14.5px] font-semibold text-fg">Bolsas mensuales</h2>
                    <span className="hidden text-[11.5px] text-fg-muted lg:inline">se cargan durante el mes</span>
                  </div>
                  <span className="text-[14px] font-semibold whitespace-nowrap text-fg">
                    <Money cents={bolsaPaidCents} size="inline" hidden={balanceHidden} /> de{' '}
                    <Money cents={bolsaTotalCents} size="inline" tone="dim" hidden={balanceHidden} />
                  </span>
                </div>
                <ul className="pb-3">
                  {bolsaStatuses.map((status) => (
                    <FixedExpenseRow
                      key={status.fe.id}
                      status={status}
                      categoryColor={categoryById.get(status.fe.category_id ?? '')?.color}
                      urgency="neutral"
                      busy={unmarkPayment.isPending}
                      hidden={balanceHidden}
                      onPrimaryAction={() => handlePrimaryAction(status)}
                      onOpenDetail={() => setDetailFixed(status.fe)}
                    />
                  ))}
                </ul>
              </Panel>
            )}

            {groupDefs.map((g) => {
              const items = groups[g.key]
              if (items.length === 0) return null
              const groupTotalCents = items.reduce((acc, s) => acc + s.remainingCents, 0)
              return (
                <Panel key={g.key}>
                  <SectionHeader title={g.title} hint={g.hint} totalCents={groupTotalCents} hidden={balanceHidden} />
                  <ul className="pb-3">
                    {items.map((status) => (
                      <FixedExpenseRow
                        key={status.fe.id}
                        status={status}
                        categoryColor={categoryById.get(status.fe.category_id ?? '')?.color}
                        urgency={g.key}
                        busy={unmarkPayment.isPending}
                        hidden={balanceHidden}
                        onPrimaryAction={() => handlePrimaryAction(status)}
                        onOpenDetail={() => setDetailFixed(status.fe)}
                      />
                    ))}
                  </ul>
                </Panel>
              )
            })}

            {nothingPending && (
              <Panel className="px-6 py-5">
                <p className="text-[13px] text-fg-muted">No tenés nada por pagar este mes.</p>
              </Panel>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SaldoProyectadoPanel
              projectedCents={projectedBalance}
              isPending={isProjectedPending}
              currentBalanceCents={currentBalance ?? 0}
              pendingFixedCount={pending.length}
              pendingFixedCents={pendingTotalCents}
              unpaidDebtsCount={unpaidDebtsCount}
              unpaidDebtsCents={misDeudasSummary.totalPendingCents}
              hidden={balanceHidden}
            />

            {doneStatuses.length > 0 && (
              <Panel>
                <div className="flex items-baseline justify-between px-6 pt-5 pb-1">
                  <p className="eyebrow">Pagados este mes</p>
                  <Money cents={paidCentsTotal} size="row" hidden={balanceHidden} />
                </div>
                <ul className="flex min-w-0 flex-col px-6 pb-5">
                  {doneStatuses.map((s) => (
                    <li key={s.fe.id} className="flex min-w-0 items-center gap-2.5 py-[7px]">
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
                          aria-label={`${s.fe.name}: quitar pago`}
                          className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse transition-opacity duration-150 hover:opacity-70 disabled:opacity-50"
                        >
                          <Check className="size-2.5" strokeWidth={2} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDetailFixed(s.fe)}
                        aria-label={`${s.fe.name}: ver detalle`}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span
                          aria-hidden
                          className="size-[7px] shrink-0 rounded-full"
                          style={{ backgroundColor: categoryById.get(s.fe.category_id ?? '')?.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-secondary">{s.fe.name}</span>
                        {s.fe.is_recurring && <span className="text-[11px] text-fg-faint">bolsa</span>}
                      </button>
                      <Money cents={s.paidCents} tone="dim" size="row" hidden={balanceHidden} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

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
                {showPaused && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-divider pt-3">
                    {pausedItems.map((fe) => (
                      <li key={fe.id} className="flex min-w-0 items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setDetailFixed(fe)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            aria-hidden
                            className="size-[7px] shrink-0 rounded-full opacity-50"
                            style={{ backgroundColor: categoryById.get(fe.category_id ?? '')?.color }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">{fe.name}</span>
                        </button>
                        <Money cents={fe.cents} tone="dim" size="row" hidden={balanceHidden} />
                      </li>
                    ))}
                  </ul>
                )}
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
          period={period}
          alreadyPaidCents={markingPaid.paidCents}
        />
      )}
      {detailFixed && (
        <FixedExpenseDetailDialog open={!!detailFixed} onClose={() => setDetailFixed(null)} fixedExpense={detailFixed} />
      )}
    </div>
  )
}
