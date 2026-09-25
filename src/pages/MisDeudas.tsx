import { useMemo, useState } from 'react'
import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Pencil, Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { IconSquare } from '@/components/ui/IconSquare'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CycleNav } from '@/components/ui/CycleNav'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { ProgresoGuardado } from '@/features/credits/ProgresoGuardado'
import { cn } from '@/lib/cn'
import { initialsFrom } from '@/lib/initials'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCycle } from '@/lib/useCycle'
import { cycleShortLabel, projectionWindow } from '@/lib/cycle'
import { pendingBeforeCents } from '@/lib/projectedBalance'
import { useCategories } from '@/features/categories/api'
import { useCurrentBalance } from '@/features/transactions/api'
import { summarizeMisDeudas, type CardSummary } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallments,
  useCreditInstallmentsRange,
  useCreditPurchasePayments,
  useStandalonePurchases,
  useUnmarkCreditPurchasePaid,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'
import { useFixedExpensePayments, useFixedExpenses, useProjectedBalanceRange } from '@/features/fixed-expenses/api'
import { fixedExpenseUrgency, summarizeFixedExpenses, type FixedExpenseUrgency } from '@/features/fixed-expenses/aggregate'
import { CreditCardFormDialog } from '@/features/credits/CreditCardFormDialog'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'
import { CardPeriodDetailDialog } from '@/features/credits/CardPeriodDetailDialog'
import { MarkCardPaidDialog } from '@/features/credits/MarkCardPaidDialog'
import { SavedAmountDialog } from '@/features/credits/SavedAmountDialog'
import { StandalonePurchaseRow } from '@/features/credits/StandalonePurchaseRow'
import { MarkPurchasePaidDialog } from '@/features/credits/MarkPurchasePaidDialog'

/** Una de las cifras chicas del hero (Guardado / Falta poner) — mismo patrón que el de Fijos. */
function HeroStat({ label, cents, tone, hint, hidden }: { label: string; cents: number; tone: MoneyTone; hint?: string; hidden: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} size="compact" tone={tone} hidden={hidden} className="mt-0.5" />
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{hint}</p>}
    </div>
  )
}

function CardCard({
  summary,
  isCurrentMonth,
  hidden,
  onEdit,
  onOpenDetail,
  onMarkPaid,
  onEditSaving,
}: {
  summary: CardSummary
  isCurrentMonth: boolean
  hidden: boolean
  onEdit: (c: CreditCard) => void
  onOpenDetail: (c: CreditCard) => void
  onMarkPaid: (c: CreditCard) => void
  onEditSaving: (c: CreditCard) => void
}) {
  const { card, items, totalCents, savedCents, missingCents, savedPercent, paid, paidAt, dueOn } = summary
  const urgency: FixedExpenseUrgency = isCurrentMonth && !paid && dueOn ? fixedExpenseUrgency(parseISO(dueOn), new Date()) : 'neutral'

  return (
    <Panel className="flex flex-col gap-3.5 p-panel-tight">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar initials={initialsFrom(card.name, null)} size="sm" shape="square" tone={paid ? 'neutral' : 'accent'} />
          <div className="min-w-0">
            <p className={cn('truncate text-[13.5px] font-semibold', paid ? 'text-fg-secondary' : 'text-fg')}>{card.name}</p>
            <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">
              {items.length} compra{items.length === 1 ? '' : 's'} en la cuota
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {paid ? (
            <Badge variant="soft">✓ Pagada</Badge>
          ) : totalCents > 0 ? (
            <Badge variant={urgency} className="whitespace-nowrap">
              {urgency === 'red' ? `Venció el ${card.due_day}` : `Vence el ${card.due_day}`}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(card)}
            aria-label={`Editar ${card.name}`}
            className="rounded-chip p-1 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
          >
            <Pencil className="size-3.5" strokeWidth={1.3} aria-hidden />
          </button>
        </div>
      </div>

      <div>
        <Money cents={totalCents} tone={paid ? 'dim' : 'fg'} size="figure" hidden={hidden} />
        <p className="mt-0.5 text-[11.5px] text-fg-muted">
          {paid && paidAt ? `pagada el ${format(new Date(paidAt), "d 'de' MMMM", { locale: es })}` : 'cuota de este mes'}
        </p>
      </div>

      {!paid && totalCents > 0 && (
        <div>
          <div className="flex items-center gap-2.5">
            <ProgresoGuardado percent={savedPercent} />
            <IconSquare active={savedPercent >= 100} onClick={() => onEditSaving(card)} aria-label={`${card.name}: cargar guardado`}>
              {savedPercent >= 100 ? (
                <Check className="size-2.5" strokeWidth={1.8} aria-hidden />
              ) : (
                <Plus className="size-2.5" strokeWidth={1.8} aria-hidden />
              )}
            </IconSquare>
          </div>
          <p className="mt-1.5 text-[11.5px] text-fg-muted">
            Guardaste <Money cents={savedCents} tone="dim" hidden={hidden} />{' '}
            {missingCents > 0 ? (
              <>
                · faltan <Money cents={missingCents} tone="negative" hidden={hidden} />
              </>
            ) : (
              '· ya está completo'
            )}
          </p>
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onOpenDetail(card)} className="flex-1">
          Detalle
        </Button>
        {!paid && (
          <Button size="sm" onClick={() => onMarkPaid(card)} disabled={totalCents === 0} className="flex-1">
            Marcar pagada
          </Button>
        )}
      </div>
    </Panel>
  )
}

/** Rail: cuotas de tarjetas + compras sueltas ya comprometidas para los próximos meses (a partir del
 *  mes que se está mirando) — un adelanto de lo que se viene, no sólo lo que falta ahora. */
function HorizontePanel({
  months,
  hidden,
}: {
  months: { label: string; amountCents: number; pct: number; current: boolean }[]
  hidden: boolean
}) {
  return (
    <Panel className="p-panel">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Próximos 3 meses</p>
        <span className="text-[11.5px] text-fg-muted">cuotas comprometidas</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {months.map((m) => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn('text-[12px] font-semibold', m.current ? 'text-fg' : 'text-fg-muted')}>{m.label}</span>
              <Money cents={m.amountCents} size="row" tone={m.current ? 'fg' : 'dim'} hidden={hidden} />
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fill-subtle">
              <div className={cn('h-full rounded-full', m.current ? 'bg-accent' : 'bg-border-strong')} style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function MisDeudas() {
  // Sólo lectura, mismo criterio que Fijos: el toggle vive en Hoy, acá se respeta la misma
  // preferencia — es el mismo saldo, ocultarlo en un lado y no en otro sería inconsistente.
  const [balanceHidden] = useHiddenBalance('saldo-actual')
  const { cycle, current, isCurrent, goToPrev, goToNext, config } = useCycle()
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null)
  const [detailCard, setDetailCard] = useState<CreditCard | null>(null)
  const [markPaidCard, setMarkPaidCard] = useState<CreditCard | null>(null)
  const [markPaidPurchase, setMarkPaidPurchase] = useState<CreditPurchase | null>(null)
  const [savingCard, setSavingCard] = useState<CreditCard | null>(null)

  // `periods` son los meses que toca el ciclo mirado (eje B — ver el mismo comentario en Fijos.tsx).
  // `period2`/`period3` son el adelanto fijo de "Próximos 3 meses", que se queda mensual a propósito
  // (vista de planificación a futuro, no la ventana de caja del usuario) — siempre a partir del
  // PRIMER mes que toca el ciclo, nunca de `month` (que puede anclar a hoy más abajo).
  const periods = cycle.months
  const viewedMonth = parseISO(cycle.months[0])
  const period2 = format(startOfMonth(addMonths(viewedMonth, 1)), 'yyyy-MM-dd')
  const period3 = format(startOfMonth(addMonths(viewedMonth, 2)), 'yyyy-MM-dd')
  // Ancla de bolsa para `summarizeFixedExpenses` — mismo criterio "en vivo" que Fijos.tsx: mientras
  // se mira el ciclo que contiene a hoy, ancla a hoy (importa si la semana en curso cruza el borde
  // del mes); si no, el primer mes que toca el ciclo navegado.
  const month = isCurrent ? new Date() : viewedMonth
  // `ventana` alimenta SÓLO el headline del saldo proyectado — nunca la lista visible de tarjetas ni
  // compras. Mismo motivo exacto que en Fijos.tsx: el cliente no tiene los pagos de un mes anterior
  // al mirado, así que no puede replicar la acumulación multi-mes que sí hace el RPC sin traer pagos
  // de varios meses (bloque 5). La lista usa `cycle` (nunca cruza de mes → siempre consistente).
  const ventana = useMemo(() => projectionWindow(cycle, current), [cycle, current])

  const { data: cards, isPending: isCardsPending, isError, refetch } = useCreditCards()
  const { data: standalonePurchases, isPending: isStandalonePending } = useStandalonePurchases()
  const { data: installments, isPending: isInstallmentsPending } = useCreditInstallmentsRange(cycle.from, cycle.to)
  const { data: installments2 } = useCreditInstallments(period2)
  const { data: installments3 } = useCreditInstallments(period3)
  const { data: savings, isPending: isSavingsPending } = useCreditCardSavings(periods)
  const { data: payments, isPending: isPaymentsPending } = useCreditCardPayments(periods)
  const { data: purchasePayments, isPending: isPurchasePaymentsPending } = useCreditPurchasePayments(periods)
  const { data: categories } = useCategories(true)
  const unmarkPurchasePaid = useUnmarkCreditPurchasePaid()

  // Cruzado con Fijos, mismo criterio que usa `Fijos.tsx` con `summarizeMisDeudas` al revés: el rail
  // de saldo proyectado desglosa fijos Y deudas sin importar en cuál de las dos pantallas estés.
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(periods)
  const { data: currentBalance } = useCurrentBalance()
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalanceRange(ventana.from, ventana.to)

  const isPending =
    isCardsPending || isStandalonePending || isInstallmentsPending || isSavingsPending || isPaymentsPending || isPurchasePaymentsPending

  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const summary = useMemo(
    () =>
      summarizeMisDeudas(
        cards ?? [],
        standalonePurchases ?? [],
        installments ?? [],
        savings ?? [],
        payments ?? [],
        purchasePayments ?? [],
      ),
    [cards, standalonePurchases, installments, savings, payments, purchasePayments],
  )

  // Mismo criterio que en Fijos.tsx: `month` varía con `cycle`/`isCurrent` (ya en las deps), no con
  // el reloj dentro del mismo render.
  const { pending: pendingFixed, pendingTotalCents: pendingFixedCents } = useMemo(
    () => summarizeFixedExpenses(fixedExpenses ?? [], fixedPayments ?? [], month, new Date(), cycle, cycle.months, config.weekStartsOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixedExpenses, fixedPayments, cycle, isCurrent, config],
  )
  // HO-03 del QA de Hoy: `unpaidCount` ya descuenta una tarjeta sin cuotas este período (antes
  // contaba como deuda impaga de $0 sólo por no tener pago).
  const unpaidDebtsCount = summary.unpaidCount

  // Aparte del desglose por categoría en Análisis, esto responde directo "cuánto pagué de deudas
  // este mes" — la tarjeta pagada no suma a totalPendingCents (ya salió como movimiento), así que
  // sin esto ese gasto quedaría sin ningún lugar visible dentro de Mis Deudas.
  const paidCards = useMemo(() => summary.perCard.filter((c) => c.paid), [summary])
  const paidPurchases = useMemo(() => summary.standalone.filter((s) => s.paid), [summary])
  const totalPaidCents = useMemo(
    () => paidCards.reduce((sum, c) => sum + c.totalCents, 0) + paidPurchases.reduce((sum, s) => sum + s.totalCents, 0),
    [paidCards, paidPurchases],
  )

  const guardadoPct = summary.totalPendingCents > 0 ? Math.min((summary.totalSavedCents / summary.totalPendingCents) * 100, 100) : 0
  const guardadoPercentLabel = Math.round(guardadoPct)

  const horizonteRaw = [
    { label: format(month, 'MMMM', { locale: es }), amountCents: (installments ?? []).reduce((sum, i) => sum + i.amountCents, 0), current: true },
    {
      label: format(addMonths(month, 1), 'MMMM', { locale: es }),
      amountCents: (installments2 ?? []).reduce((sum, i) => sum + i.amountCents, 0),
      current: false,
    },
    {
      label: format(addMonths(month, 2), 'MMMM', { locale: es }),
      amountCents: (installments3 ?? []).reduce((sum, i) => sum + i.amountCents, 0),
      current: false,
    },
  ]
  const horizonteMax = Math.max(...horizonteRaw.map((m) => m.amountCents), 1)
  const horizonte = horizonteRaw.map((m) => ({ ...m, pct: (m.amountCents / horizonteMax) * 100 }))
  const showHorizonte = horizonte.some((m) => m.amountCents > 0)

  const hasAny = (cards ?? []).length > 0 || (standalonePurchases ?? []).length > 0

  function openNewCard() {
    setEditingCard(null)
    setCardFormOpen(true)
  }

  function openEditCard(card: CreditCard) {
    setEditingCard(card)
    setCardFormOpen(true)
  }

  function openNewPurchase() {
    setEditingPurchase(null)
    setPurchaseFormOpen(true)
  }

  function openEditStandalonePurchase(purchase: CreditPurchase) {
    setEditingPurchase(purchase)
    setPurchaseFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <h1 className="font-display text-figure font-semibold">Mis Deudas</h1>
          <CycleNav cycle={cycle} onPrev={goToPrev} onNext={goToNext} />
        </div>

        <div className="hidden lg:block">
          <CycleNav cycle={cycle} onPrev={goToPrev} onNext={goToNext} />
          <h1 className="mt-2 font-display text-figure font-semibold">Mis Deudas</h1>
        </div>

        {/* Ya no hay tabs Fijos/Mis Deudas/Me Deben acá — cada pantalla se navega desde el nav
            general, no cruzando entre sí (mismo cambio que ya se hizo en Fijos). */}
        <div className="flex gap-2">
          <Button variant="outline" size="compact" onClick={openNewCard} className="flex-1 lg:flex-none">
            Nueva tarjeta
          </Button>
          <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={openNewPurchase} className="flex-1 lg:flex-none">
            Nueva compra
          </Button>
        </div>
      </header>

      {isError ? (
        <Panel className="px-panel py-10">
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="flex flex-col gap-3 p-panel">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
            </Panel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Panel key={i} className="p-panel-tight">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-9 w-36" />
                  <Skeleton className="mt-4 h-8 w-full" />
                </Panel>
              ))}
            </div>
          </div>
          <Skeleton className="h-48 w-full rounded-panel" />
        </div>
      ) : !hasAny ? (
        <Panel>
          <EmptyState
            glyph="▤"
            title="Todavía no cargaste ninguna deuda"
            hint="Cargá tu tarjeta de crédito para anotar las compras en cuotas, o una compra suelta si no tenés tarjeta de por medio."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={openNewCard}>
                  Nueva tarjeta
                </Button>
                <Button onClick={openNewPurchase}>Nueva compra</Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* Centrado verticalmente y sin "Lo más próximo" — a diferencia de Fijos, acá la pregunta
                es sólo "cuánto pago de deudas", no "qué vence primero" (eso ya lo dice cada tarjeta). */}
            <Panel className="flex flex-col gap-5 p-panel-tight lg:flex-row lg:items-center lg:gap-9 lg:p-6">
              <div className="lg:hidden">
                <p className="eyebrow">A pagar este mes</p>
                <Money cents={summary.totalPendingCents} size="hero" hidden={balanceHidden} className="mt-1" />
                <div className="mt-3 flex h-[7px] overflow-hidden rounded-full bg-fill-subtle">
                  <div className="h-full bg-accent" style={{ width: `${guardadoPct}%` }} />
                  <div className="h-full bg-negative" style={{ width: `${100 - guardadoPct}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  <HeroStat label="Guardado" cents={summary.totalSavedCents} tone="accent" hint={`${guardadoPercentLabel}% de la cuota`} hidden={balanceHidden} />
                  <HeroStat
                    label="Falta poner"
                    cents={summary.totalMissingCents}
                    tone="fg"
                    hint={`${unpaidDebtsCount} deuda${unpaidDebtsCount === 1 ? '' : 's'} sin cubrir`}
                    hidden={balanceHidden}
                  />
                </div>
              </div>

              <div className="hidden flex-none lg:block">
                <p className="eyebrow">A pagar de deudas en {cycleShortLabel(cycle)}</p>
                <Money cents={summary.totalPendingCents} size="total" className="mt-1" hidden={balanceHidden} />
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
                <div className="flex h-2 overflow-hidden rounded-full bg-fill-subtle">
                  <div className="h-full bg-accent" style={{ width: `${guardadoPct}%` }} />
                  <div className="h-full bg-negative" style={{ width: `${100 - guardadoPct}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
                  <HeroStat label="Guardado" cents={summary.totalSavedCents} tone="accent" hint={`${guardadoPercentLabel}% de la cuota del mes`} hidden={balanceHidden} />
                  <HeroStat
                    label="Falta poner"
                    cents={summary.totalMissingCents}
                    tone="fg"
                    hint={`${unpaidDebtsCount} deuda${unpaidDebtsCount === 1 ? '' : 's'} sin cubrir`}
                    hidden={balanceHidden}
                  />
                </div>
              </div>
            </Panel>

            {summary.perCard.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {summary.perCard.map((cardSummary) => (
                  <CardCard
                    key={cardSummary.card.id}
                    summary={cardSummary}
                    isCurrentMonth={isCurrent}
                    hidden={balanceHidden}
                    onEdit={openEditCard}
                    onOpenDetail={setDetailCard}
                    onMarkPaid={setMarkPaidCard}
                    onEditSaving={setSavingCard}
                  />
                ))}
              </div>
            )}

            {summary.standalone.length > 0 && (
              <Panel className="pb-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-divider px-panel pt-5 pb-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-display text-[14.5px] font-semibold text-fg">Compras sin tarjeta</h2>
                    <span className="text-[11.5px] text-fg-muted">cuotas de este mes</span>
                  </div>
                  <Money cents={summary.standalone.reduce((sum, s) => sum + s.totalCents, 0)} size="row" hidden={balanceHidden} />
                </div>
                <ul className="pb-3">
                  {summary.standalone.map((s) => (
                    <StandalonePurchaseRow
                      key={s.purchase.id}
                      summary={s}
                      isCurrentMonth={isCurrent}
                      hidden={balanceHidden}
                      categoryColor={categoryById.get(s.purchase.category_id ?? '')?.color}
                      categoryName={categoryById.get(s.purchase.category_id ?? '')?.name}
                      onEdit={() => openEditStandalonePurchase(s.purchase)}
                      onMarkPaid={() => setMarkPaidPurchase(s.purchase)}
                      onUnmarkPaid={() => unmarkPurchasePaid.mutate({ purchaseId: s.purchase.id, period: s.item.period })}
                    />
                  ))}
                </ul>
              </Panel>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SaldoProyectadoPanel
              cycleKind={cycle.kind}
              projectedCents={projectedBalance}
              isPending={isProjectedPending}
              currentBalanceCents={currentBalance ?? 0}
              pendingFixedCount={pendingFixed.length}
              pendingFixedCents={pendingFixedCents}
              unpaidDebtsCount={unpaidDebtsCount}
              unpaidDebtsCents={summary.totalPendingCents}
              // FI-08: mismo criterio que Fijos.tsx.
              pendingBeforeCents={pendingBeforeCents(currentBalance ?? 0, pendingFixedCents, summary.totalPendingCents, projectedBalance)}
              hidden={balanceHidden}
              footnote="El mismo número que ves en Fijos."
            />

            {showHorizonte && <HorizontePanel months={horizonte} hidden={balanceHidden} />}

            {(paidCards.length > 0 || paidPurchases.length > 0) && (
              <Panel>
                <div className="flex items-baseline justify-between px-panel pt-5 pb-1">
                  <p className="eyebrow">Pagado este mes</p>
                  <Money cents={totalPaidCents} size="row" hidden={balanceHidden} />
                </div>
                <ul className="flex min-w-0 flex-col px-panel pb-5">
                  {paidCards.map((c) => (
                    <li key={c.card.id} className="flex min-w-0 items-center gap-2.5 py-[7px]">
                      <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse">
                        <Check className="size-2.5" strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-secondary">
                        {c.card.name} <span className="text-fg-faint">· {c.items.length} compras</span>
                      </span>
                      <Money cents={c.totalCents} tone="dim" size="row" hidden={balanceHidden} />
                    </li>
                  ))}
                  {paidPurchases.map((s) => (
                    <li key={s.purchase.id} className="flex min-w-0 items-center gap-2.5 py-[7px]">
                      <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse">
                        <Check className="size-2.5" strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-secondary">{s.purchase.description}</span>
                      <Money cents={s.totalCents} tone="dim" size="row" hidden={balanceHidden} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}

      {cardFormOpen && (
        <CreditCardFormDialog open={cardFormOpen} onClose={() => setCardFormOpen(false)} card={editingCard} />
      )}
      {purchaseFormOpen && (
        <PurchaseFormDialog
          open={purchaseFormOpen}
          onClose={() => setPurchaseFormOpen(false)}
          cards={cards ?? []}
          purchase={editingPurchase}
        />
      )}
      {detailCard &&
        (() => {
          const s = summary.perCard.find((c) => c.card.id === detailCard.id) ?? null
          // El período de ESTE resumen, no el primer mes del ciclo a secas — con un ciclo semanal a
          // caballo de dos meses (bloque 5 del plan), la cuota de esta tarjeta puede estar en el
          // segundo. Sin ítems (nada que vencer), cae al primer mes del ciclo como siempre.
          const cardPeriod = s?.items[0]?.period ?? periods[0]
          return <CardPeriodDetailDialog open={!!detailCard} onClose={() => setDetailCard(null)} card={detailCard} period={cardPeriod} summary={s} />
        })()}
      {markPaidCard &&
        (() => {
          const s = summary.perCard.find((c) => c.card.id === markPaidCard.id) ?? null
          const cardPeriod = s?.items[0]?.period ?? periods[0]
          return <MarkCardPaidDialog open={!!markPaidCard} onClose={() => setMarkPaidCard(null)} card={markPaidCard} period={cardPeriod} summary={s} />
        })()}
      {savingCard &&
        (() => {
          const s = summary.perCard.find((c) => c.card.id === savingCard.id)
          if (!s) return null
          const cardPeriod = s.items[0]?.period ?? periods[0]
          return <SavedAmountDialog open onClose={() => setSavingCard(null)} card={savingCard} period={cardPeriod} savedCents={s.savedCents} />
        })()}
      {markPaidPurchase &&
        (() => {
          const s = summary.standalone.find((s) => s.purchase.id === markPaidPurchase.id)
          if (!s) return null
          return (
            <MarkPurchasePaidDialog
              open={!!markPaidPurchase}
              onClose={() => setMarkPaidPurchase(null)}
              purchase={markPaidPurchase}
              period={s.item.period}
              installmentNo={s.item.installment_no}
              installments={s.item.installments}
              totalCents={s.totalCents}
            />
          )
        })()}
    </div>
  )
}
