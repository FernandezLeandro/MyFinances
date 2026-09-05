import { useMemo, useState } from 'react'
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Pencil } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { MonthNav } from '@/components/ui/MonthNav'
import { PendientesTabs } from '@/components/PendientesTabs'
import { ProgresoGuardado } from '@/features/credits/ProgresoGuardado'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { summarizeMisDeudas, type CardSummary } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallments,
  useCreditPurchasePayments,
  useStandalonePurchases,
  useUnmarkCreditPurchasePaid,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'
import { useProjectedBalance } from '@/features/fixed-expenses/api'
import { CreditCardFormDialog } from '@/features/credits/CreditCardFormDialog'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'
import { CardPeriodDetailDialog } from '@/features/credits/CardPeriodDetailDialog'
import { MarkCardPaidDialog } from '@/features/credits/MarkCardPaidDialog'
import { StandalonePurchaseRow } from '@/features/credits/StandalonePurchaseRow'
import { MarkPurchasePaidDialog } from '@/features/credits/MarkPurchasePaidDialog'

function CardCard({
  summary,
  isCurrentMonth,
  hidden,
  onEdit,
  onOpenDetail,
  onMarkPaid,
}: {
  summary: CardSummary
  isCurrentMonth: boolean
  hidden: boolean
  onEdit: (c: CreditCard) => void
  onOpenDetail: (c: CreditCard) => void
  onMarkPaid: (c: CreditCard) => void
}) {
  const { card, totalCents, savedCents, missingCents, savedPercent, paid } = summary
  const vencido = isCurrentMonth && !paid && totalCents > 0 && new Date().getDate() > card.due_day

  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-chalk-dim">{card.name}</p>
          <p className="mt-0.5 text-[12px]">
            <span className={vencido ? 'text-coral' : 'text-chalk-faint'}>
              {vencido ? `Venció el ${card.due_day}` : `Vence el ${card.due_day}`}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEdit(card)}
          aria-label={`Editar ${card.name}`}
          className="shrink-0 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
        >
          <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
        </button>
      </div>

      <div className="mt-3">
        <Money cents={totalCents} tone={paid ? 'dim' : 'chalk'} size="figure" hidden={hidden} />
        {paid && <p className="mt-1 text-[12px] font-medium text-acid">Pagada este mes</p>}
      </div>

      {!paid && totalCents > 0 && (
        <div className="mt-4">
          <ProgresoGuardado percent={savedPercent} />
          <p className="mt-1.5 text-[12px] text-chalk-faint">
            Guardaste <Money cents={savedCents} tone="dim" hidden={hidden} /> · faltan{' '}
            <Money cents={missingCents} tone={missingCents > 0 ? 'coral' : 'dim'} hidden={hidden} />
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
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

export function MisDeudas() {
  // Sólo lectura, mismo criterio que Fijos: el toggle vive en Hoy, acá se respeta la misma
  // preferencia — es el mismo saldo, ocultarlo en un lado y no en otro sería inconsistente.
  const [balanceHidden] = useHiddenBalance('saldo-actual')
  const [month, setMonth] = useState(() => new Date())
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null)
  const [detailCard, setDetailCard] = useState<CreditCard | null>(null)
  const [markPaidCard, setMarkPaidCard] = useState<CreditCard | null>(null)
  const [markPaidPurchase, setMarkPaidPurchase] = useState<CreditPurchase | null>(null)

  const period = format(startOfMonth(month), 'yyyy-MM-dd')
  const isCurrentMonth = isSameMonth(month, new Date())

  const { data: cards, isPending: isCardsPending, isError, refetch } = useCreditCards()
  const { data: standalonePurchases, isPending: isStandalonePending } = useStandalonePurchases()
  const { data: installments, isPending: isInstallmentsPending } = useCreditInstallments(period)
  const { data: savings, isPending: isSavingsPending } = useCreditCardSavings(period)
  const { data: payments, isPending: isPaymentsPending } = useCreditCardPayments(period)
  const { data: purchasePayments, isPending: isPurchasePaymentsPending } = useCreditPurchasePayments(period)
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)
  const unmarkPurchasePaid = useUnmarkCreditPurchasePaid()

  const isPending =
    isCardsPending || isStandalonePending || isInstallmentsPending || isSavingsPending || isPaymentsPending || isPurchasePaymentsPending

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

  // Aparte del desglose por categoría en Análisis, esto responde directo "cuánto pagué de tarjeta
  // este mes" — la tarjeta pagada no suma a totalPendingCents (ya salió como movimiento), así que
  // sin esto ese gasto quedaría sin ningún lugar visible dentro de Mis Deudas.
  const totalPaidCents = useMemo(
    () =>
      (payments ?? []).reduce((sum, p) => sum + p.amountPaidCents, 0) +
      (purchasePayments ?? []).reduce((sum, p) => sum + p.amountPaidCents, 0),
    [payments, purchasePayments],
  )

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
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <MonthNav
            label={format(month, 'MMMM yyyy', { locale: es })}
            onPrev={() => setMonth((m) => subMonths(m, 1))}
            onNext={() => setMonth((m) => addMonths(m, 1))}
          />
          <h1 className="mt-2 font-display text-figure font-semibold">Mis Deudas</h1>
          <div className="mt-3">
            <PendientesTabs />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNewCard}>
            Nueva tarjeta
          </Button>
          <Button icon={<span className="text-base leading-none">+</span>} onClick={openNewPurchase}>
            Nueva compra
          </Button>
        </div>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 w-full rounded-panel" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Panel key={i} className="p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-3 h-9 w-36" />
                <Skeleton className="mt-4 h-8 w-full" />
              </Panel>
            ))}
          </div>
        </div>
      ) : !hasAny ? (
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
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel className="p-6 ring-1 ring-acid/15 lg:col-span-1">
              <p className="eyebrow">Total a pagar este mes</p>
              <Money cents={summary.totalPendingCents} tone="chalk" size="figure" className="mt-2" hidden={balanceHidden} />
              <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Guardado</dt>
                  <dd>
                    <Money cents={summary.totalSavedCents} tone="dim" hidden={balanceHidden} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Falta</dt>
                  <dd>
                    <Money cents={summary.totalMissingCents} tone={summary.totalMissingCents > 0 ? 'coral' : 'dim'} hidden={balanceHidden} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Pagado este mes</dt>
                  <dd>
                    <Money cents={totalPaidCents} tone="dim" hidden={balanceHidden} />
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel className="p-6 lg:col-span-2">
              <p className="eyebrow">Saldo proyectado a fin de mes</p>
              {isProjectedPending ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : (
                <Money cents={projectedBalance ?? 0} tone="chalk" size="figure" className="mt-2" hidden={balanceHidden} />
              )}
              <p className="mt-3 text-[12px] text-chalk-faint">
                Ya descuenta los fijos y las deudas impagas de este período — el mismo número que ves en Fijos.
              </p>
            </Panel>
          </div>

          {summary.perCard.length > 0 && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {summary.perCard.map((cardSummary) => (
                <CardCard
                  key={cardSummary.card.id}
                  summary={cardSummary}
                  isCurrentMonth={isCurrentMonth}
                  hidden={balanceHidden}
                  onEdit={openEditCard}
                  onOpenDetail={setDetailCard}
                  onMarkPaid={setMarkPaidCard}
                />
              ))}
            </div>
          )}

          {summary.standalone.length > 0 && (
            <Panel>
              <PanelHeader title="Compras sin tarjeta" hint="Cuotas de este mes" />
              <ul>
                {summary.standalone.map((s) => (
                  <StandalonePurchaseRow
                    key={s.purchase.id}
                    summary={s}
                    isCurrentMonth={isCurrentMonth}
                    onEdit={() => openEditStandalonePurchase(s.purchase)}
                    onMarkPaid={() => setMarkPaidPurchase(s.purchase)}
                    onUnmarkPaid={() => unmarkPurchasePaid.mutate({ purchaseId: s.purchase.id, period })}
                  />
                ))}
              </ul>
            </Panel>
          )}
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
      {detailCard && (
        <CardPeriodDetailDialog
          open={!!detailCard}
          onClose={() => setDetailCard(null)}
          card={detailCard}
          period={period}
          summary={summary.perCard.find((c) => c.card.id === detailCard.id) ?? null}
        />
      )}
      {markPaidCard && (
        <MarkCardPaidDialog
          open={!!markPaidCard}
          onClose={() => setMarkPaidCard(null)}
          card={markPaidCard}
          period={period}
          summary={summary.perCard.find((c) => c.card.id === markPaidCard.id) ?? null}
        />
      )}
      {markPaidPurchase &&
        (() => {
          const s = summary.standalone.find((s) => s.purchase.id === markPaidPurchase.id)
          if (!s) return null
          return (
            <MarkPurchasePaidDialog
              open={!!markPaidPurchase}
              onClose={() => setMarkPaidPurchase(null)}
              purchase={markPaidPurchase}
              period={period}
              installmentNo={s.item.installment_no}
              installments={s.item.installments}
              totalCents={s.totalCents}
            />
          )
        })()}
    </div>
  )
}
