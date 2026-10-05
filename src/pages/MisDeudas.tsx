import { useMemo, useState } from 'react'
import { addMonths, format, getDate, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { AnimatePresence, m } from 'motion/react'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { CountUpMoney, Money } from '@/components/ui/Money'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { StackedBar } from '@/components/ui/StackedBar'
import { Stat, StatRow } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CycleNav } from '@/components/ui/CycleNav'
import { SaldoProyectadoPanel } from '@/components/SaldoProyectadoPanel'
import { cn } from '@/lib/cn'
import { initialsFrom } from '@/lib/initials'
import { ROW_PRESENCE } from '@/lib/motion'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useCycle } from '@/lib/useCycle'
import { cycleShortLabel, projectionWindow } from '@/lib/cycle'
import { pendingBeforeCents } from '@/lib/projectedBalance'
import { useCategories, type Category } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { useCurrentBalance } from '@/features/transactions/api'
import { debtList, debtName, summarizeMisDeudas, type Debt } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCards,
  useCreditInstallments,
  useCreditInstallmentsRange,
  useCreditPurchasePayments,
  useCreditSavings,
  useStandalonePurchases,
} from '@/features/credits/api'
import {
  useFixedExpensePayments,
  useFixedExpenseSavings,
  useFixedExpenses,
  useProjectedBalanceRange,
} from '@/features/fixed-expenses/api'
import { fixedExpenseUrgency, summarizeFixedExpenses, type FixedExpenseUrgency } from '@/features/fixed-expenses/aggregate'
import { CreditCardFormDialog } from '@/features/credits/CreditCardFormDialog'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'
import { DebtSheet } from '@/features/credits/DebtSheet'

/** Identifica una deuda entre renders — el panel abierto se vuelve a buscar en el resumen fresco,
 *  así refleja al instante lo que se guarda o paga adentro. */
type DebtKey = { kind: Debt['kind']; id: string }

function keyOf(debt: Debt): DebtKey {
  return debt.kind === 'card' ? { kind: 'card', id: debt.summary.card.id } : { kind: 'purchase', id: debt.summary.purchase.id }
}

/** Fila de la lista «Este ciclo»: una tarjeta o una compra sin tarjeta, con lo guardado y el
 *  vencimiento. Toda la fila abre el panel de la deuda (`DebtSheet`), donde se guarda y se paga. */
function DebtRow({ debt, category, isCurrentCycle, hidden, onOpen }: {
  debt: Debt
  /** Sólo una compra sin tarjeta: su ficha de categoría (una tarjeta lleva sus iniciales). */
  category: Category | undefined
  isCurrentCycle: boolean
  hidden: boolean
  onOpen: () => void
}) {
  const { totalCents, savedCents, savedPercent, dueOn, paid } = debt.summary
  const urgency: FixedExpenseUrgency = isCurrentCycle && !paid && dueOn ? fixedExpenseUrgency(parseISO(dueOn), new Date()) : 'neutral'
  const name = debtName(debt)
  const dueDay = dueOn ? getDate(parseISO(dueOn)) : null
  const subtitle =
    debt.kind === 'card'
      ? debt.summary.items.length === 0
        ? 'Sin cuotas este ciclo'
        : `${debt.summary.items.length} compra${debt.summary.items.length === 1 ? '' : 's'}`
      : `Sin tarjeta${debt.summary.item.installments > 1 ? ` · cuota ${debt.summary.item.installment_no}/${debt.summary.item.installments}` : ''}`

  return (
    <m.li {...ROW_PRESENCE} className="overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-center gap-3 px-panel py-3.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
      >
        {debt.kind === 'card' ? (
          <Avatar initials={initialsFrom(name, null)} size="sm" shape="square" tone="accent" />
        ) : (
          <CategoryChip {...chipLook(category)} size={28} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-fg">{name}</span>
          {/* Envuelve en vez de truncar: a 320px con un importe de 7+ cifras a la derecha, una línea
              sola dejaba el subtítulo en cero (mismo hallazgo que las filas de Fijos). */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
            <span>{subtitle}</span>
            {/* Bajo `sm` el vencimiento va acá, y el badge de la derecha se oculta. */}
            {dueDay != null && (
              <span className={cn('sm:hidden', urgency === 'red' && 'text-badge-red-fg')}>
                {urgency === 'red' ? `Venció el ${dueDay}` : `Vence el ${dueDay}`}
              </span>
            )}
            {savedCents > 0 && totalCents > 0 && (
              <span className="flex items-center gap-1.5">
                <MiniProgress pct={savedPercent} tone="accent" size="inline" />
                <span className="tabular-nums">{savedPercent}%</span>
              </span>
            )}
          </span>
        </span>
        {/* El wrapper (no `className` en `Badge`): `Badge` trae `inline-flex` sin condición y le gana
            a `hidden` en la cascada — mismo motivo que en las filas de Fijos. */}
        {dueDay != null && (
          <span className="hidden shrink-0 sm:block">
            <Badge variant={urgency} className="whitespace-nowrap">
              {urgency === 'red' ? `Venció el ${dueDay}` : `Vence el ${dueDay}`}
            </Badge>
          </span>
        )}
        <Money cents={totalCents} size="row" hidden={hidden} className="shrink-0" />
        <ChevronRight className="size-4 shrink-0 text-fg-faint" aria-hidden />
      </button>
    </m.li>
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
        {months.map((mo) => (
          <div key={mo.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn('text-[12px] font-semibold', mo.current ? 'text-fg' : 'text-fg-muted')}>{mo.label}</span>
              <Money cents={mo.amountCents} size="row" tone={mo.current ? 'fg' : 'dim'} hidden={hidden} />
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fill-subtle">
              <div className={cn('h-full rounded-full', mo.current ? 'bg-accent' : 'bg-border-strong')} style={{ width: `${mo.pct}%` }} />
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
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [openKey, setOpenKey] = useState<DebtKey | null>(null)

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
  // `ventana` alimenta SÓLO el headline del saldo proyectado — nunca la lista visible de deudas.
  // Mismo motivo exacto que en Fijos.tsx: el cliente no tiene los pagos de un mes anterior al mirado,
  // así que no puede replicar la acumulación multi-mes que sí hace el RPC sin traer pagos de varios
  // meses (bloque 5). La lista usa `cycle` (nunca cruza de mes → siempre consistente).
  const ventana = useMemo(() => projectionWindow(cycle, current), [cycle, current])

  const { data: cards, isPending: isCardsPending, isError, refetch } = useCreditCards()
  const { data: standalonePurchases, isPending: isStandalonePending } = useStandalonePurchases()
  const { data: installments, isPending: isInstallmentsPending } = useCreditInstallmentsRange(cycle.from, cycle.to)
  const { data: installments2 } = useCreditInstallments(period2)
  const { data: installments3 } = useCreditInstallments(period3)
  const { data: savings, isPending: isSavingsPending } = useCreditSavings(periods)
  const { data: payments, isPending: isPaymentsPending } = useCreditCardPayments(periods)
  const { data: purchasePayments, isPending: isPurchasePaymentsPending } = useCreditPurchasePayments(periods)
  const { data: categories } = useCategories(true)

  // Cruzado con Fijos, mismo criterio que usa `Fijos.tsx` con `summarizeMisDeudas` al revés: el rail
  // de saldo proyectado desglosa fijos Y deudas sin importar en cuál de las dos pantallas estés.
  const { data: fixedExpenses } = useFixedExpenses()
  const { data: fixedPayments } = useFixedExpensePayments(periods)
  // Antes no se pedían: «Fijos por pagar» no descontaba los guardados con movimiento ni mostraba
  // «Guardado para fijos», y el desglose no coincidía con el de Fijos aunque el titular sí.
  const { data: fixedSavings } = useFixedExpenseSavings(periods)
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
  const { unpaid, paid } = useMemo(() => debtList(summary), [summary])

  // Mismo criterio que en Fijos.tsx: `month` varía con `cycle`/`isCurrent` (ya en las deps), no con
  // el reloj dentro del mismo render.
  const {
    pending: pendingFixed,
    pendingTotalCents: pendingFixedCents,
    savedTotalCents: savedFixedCents,
  } = useMemo(
    () =>
      summarizeFixedExpenses(fixedExpenses ?? [], fixedPayments ?? [], month, new Date(), cycle, cycle.months, config.weekStartsOn, fixedSavings ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixedExpenses, fixedPayments, fixedSavings, cycle, isCurrent, config],
  )

  // Aparte del desglose por categoría en Análisis, esto responde directo "cuánto pagué de deudas
  // este mes" — una deuda pagada no suma a lo pendiente (ya salió como movimiento), así que sin esto
  // ese gasto quedaría sin ningún lugar visible dentro de Mis Deudas.
  const totalPaidCents = paid.reduce((sum, d) => sum + d.summary.totalCents, 0)

  const { totalDueCents, totalSavedCents, totalMissingCents } = summary
  const savedPct = totalDueCents > 0 ? (totalSavedCents / totalDueCents) * 100 : 0
  const savedPercentLabel = Math.round(savedPct)
  const allPaid = totalDueCents === 0 && paid.length > 0

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
  const horizonteMax = Math.max(...horizonteRaw.map((mo) => mo.amountCents), 1)
  const horizonte = horizonteRaw.map((mo) => ({ ...mo, pct: (mo.amountCents / horizonteMax) * 100 }))
  const showHorizonte = horizonte.some((mo) => mo.amountCents > 0)

  const hasAny = (cards ?? []).length > 0 || (standalonePurchases ?? []).length > 0
  const openDebt = openKey ? [...unpaid, ...paid].find((d) => keyOf(d).kind === openKey.kind && keyOf(d).id === openKey.id) ?? null : null

  function rowCategory(debt: Debt) {
    return debt.kind === 'purchase' ? categoryById.get(debt.summary.purchase.category_id ?? '') : undefined
  }

  const headerActions = (
    <div className="flex gap-2">
      <Button variant="outline" size="compact" onClick={() => setCardFormOpen(true)} className="flex-1 lg:flex-none">
        Nueva tarjeta
      </Button>
      <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={() => setPurchaseFormOpen(true)} className="flex-1 lg:flex-none">
        Nueva compra
      </Button>
    </div>
  )

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

        {headerActions}
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
            <Panel className="flex flex-col gap-4 p-panel">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </Panel>
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
                <Button variant="outline" onClick={() => setCardFormOpen(true)}>
                  Nueva tarjeta
                </Button>
                <Button onClick={() => setPurchaseFormOpen(true)}>Nueva compra</Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="flex flex-col gap-5 p-panel">
              <div>
                <p className="eyebrow">A pagar en {cycleShortLabel(cycle)}</p>
                <CountUpMoney cents={totalDueCents} size="hero" hidden={balanceHidden} className="mt-1" />
              </div>
              {allPaid ? (
                <div className="flex items-center gap-2.5 text-[13.5px] font-semibold text-fg">
                  {/* Momento raro (todo pagado en el ciclo): el único lugar de la pantalla con resorte,
                      mismo valor que «Todo pagado» en Fijos. */}
                  <m.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', duration: 0.45, bounce: 0.3, delay: 0.15 }}
                    className="grid size-6 place-items-center rounded-full bg-accent text-on-accent"
                  >
                    <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
                  </m.span>
                  Todo pagado este ciclo
                </div>
              ) : (
                <>
                  {/* Un solo segmento: con o sin movimiento, todo lo guardado descuenta del pago. Con
                      dos (con movimiento en acento, aparte en gris) el gris se confundía con el track
                      en oscuro y una deuda cubierta parecía a medias. */}
                  <StackedBar segments={[{ pct: savedPct, color: 'var(--color-accent)' }]} />
                  <StatRow className="flex-wrap gap-x-7 gap-y-3">
                    <Stat label="Guardado">
                      <CountUpMoney cents={totalSavedCents} tone="accent" size="figure" hidden={balanceHidden} />
                      <p className="mt-0.5 text-[11.5px] text-fg-muted">{savedPercentLabel}% de lo que vence</p>
                    </Stat>
                    <Stat label="Falta poner">
                      <CountUpMoney cents={totalMissingCents} tone="fg" size="figure" hidden={balanceHidden} />
                      <p className="mt-0.5 text-[11.5px] text-fg-muted">
                        {summary.unpaidCount} deuda{summary.unpaidCount === 1 ? '' : 's'} sin pagar
                      </p>
                    </Stat>
                  </StatRow>
                </>
              )}
            </Panel>

            {unpaid.length > 0 && (
              <Panel className="pb-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-divider px-panel pt-5 pb-3">
                  <h2 className="font-display text-[14.5px] font-semibold text-fg">Este ciclo</h2>
                  <span className="text-[11.5px] text-fg-muted">tocá una para guardar o pagar</span>
                </div>
                {/* `key` por ciclo: navegar de ciclo remonta la lista sin animar; dentro del mismo
                    ciclo, pagar una deuda la saca con la misma salida que una fila de Fijos. */}
                <ul key={cycle.from}>
                  <AnimatePresence initial={false}>
                    {unpaid.map((debt) => (
                      <DebtRow
                        key={`${debt.kind}-${keyOf(debt).id}`}
                        debt={debt}
                        category={rowCategory(debt)}
                        isCurrentCycle={isCurrent}
                        hidden={balanceHidden}
                        onOpen={() => setOpenKey(keyOf(debt))}
                      />
                    ))}
                  </AnimatePresence>
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
              savedFixedCents={savedFixedCents}
              unpaidDebtsCount={summary.unpaidCount}
              unpaidDebtsCents={summary.totalPendingCents}
              // FI-08: mismo criterio que Fijos.tsx.
              pendingBeforeCents={pendingBeforeCents(currentBalance ?? 0, pendingFixedCents, summary.totalPendingCents, projectedBalance)}
              hidden={balanceHidden}
              footnote="El mismo número que ves en Fijos."
            />

            {showHorizonte && <HorizontePanel months={horizonte} hidden={balanceHidden} />}

            {paid.length > 0 && (
              <Panel>
                <div className="flex items-baseline justify-between px-panel pt-5 pb-1">
                  <p className="eyebrow">Pagado este ciclo</p>
                  <Money cents={totalPaidCents} size="row" hidden={balanceHidden} />
                </div>
                <ul className="flex min-w-0 flex-col pb-3">
                  {paid.map((debt) => (
                    <li key={`${debt.kind}-${keyOf(debt).id}`}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(keyOf(debt))}
                        className="flex w-full min-w-0 items-center gap-2.5 px-panel py-[7px] text-left transition-colors duration-150 hover:bg-fill-subtle"
                      >
                        <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse">
                          <Check className="size-2.5" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-secondary">
                          {debtName(debt)}
                          {debt.kind === 'card' && (
                            <span className="text-fg-faint">
                              {' '}
                              · {debt.summary.items.length} compra{debt.summary.items.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </span>
                        <Money cents={debt.summary.totalCents} tone="dim" size="row" hidden={balanceHidden} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}

      {cardFormOpen && <CreditCardFormDialog open onClose={() => setCardFormOpen(false)} />}
      {purchaseFormOpen && <PurchaseFormDialog open onClose={() => setPurchaseFormOpen(false)} cards={cards ?? []} />}
      {openDebt && (
        <DebtSheet
          // Otra deuda = panel nuevo: no arrastra la vista ni la fila abierta de la anterior.
          key={`${openDebt.kind}-${keyOf(openDebt).id}`}
          open
          onClose={() => setOpenKey(null)}
          debt={openDebt}
          cards={cards ?? []}
          fallbackPeriod={periods[0]}
        />
      )}
    </div>
  )
}
