import { useMemo, useState } from 'react'
import { addMonths, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { ObligacionesTabs } from '@/features/credits/ObligacionesTabs'
import { ProgresoGuardado } from '@/features/credits/ProgresoGuardado'
import { summarizeCredits, type CardSummary } from '@/features/credits/aggregate'
import {
  useCreditCardPayments,
  useCreditCardSavings,
  useCreditCards,
  useCreditInstallments,
  type CreditCard,
} from '@/features/credits/api'
import { useProjectedBalance } from '@/features/fixed-expenses/api'
import { CreditCardFormDialog } from '@/features/credits/CreditCardFormDialog'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'
import { CardPeriodDetailDialog } from '@/features/credits/CardPeriodDetailDialog'
import { MarkCardPaidDialog } from '@/features/credits/MarkCardPaidDialog'

function CardCard({
  summary,
  isCurrentMonth,
  onEdit,
  onOpenDetail,
  onMarkPaid,
}: {
  summary: CardSummary
  isCurrentMonth: boolean
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
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3">
        <Money cents={totalCents} tone={paid ? 'dim' : 'chalk'} size="figure" />
        {paid && <p className="mt-1 text-[12px] font-medium text-acid">Pagada este mes</p>}
      </div>

      {!paid && totalCents > 0 && (
        <div className="mt-4">
          <ProgresoGuardado percent={savedPercent} />
          <p className="mt-1.5 text-[12px] text-chalk-faint">
            Guardaste <Money cents={savedCents} tone="dim" /> · faltan{' '}
            <Money cents={missingCents} tone={missingCents > 0 ? 'coral' : 'dim'} />
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

export function Creditos() {
  const [month, setMonth] = useState(() => new Date())
  const [cardFormOpen, setCardFormOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false)
  const [detailCard, setDetailCard] = useState<CreditCard | null>(null)
  const [markPaidCard, setMarkPaidCard] = useState<CreditCard | null>(null)

  const period = format(startOfMonth(month), 'yyyy-MM-dd')
  const isCurrentMonth = isSameMonth(month, new Date())

  const { data: cards, isPending: isCardsPending, isError, refetch } = useCreditCards()
  const { data: installments, isPending: isInstallmentsPending } = useCreditInstallments(period)
  const { data: savings, isPending: isSavingsPending } = useCreditCardSavings(period)
  const { data: payments, isPending: isPaymentsPending } = useCreditCardPayments(period)
  const { data: projectedBalance, isPending: isProjectedPending } = useProjectedBalance(period)

  const isPending = isCardsPending || isInstallmentsPending || isSavingsPending || isPaymentsPending

  const summary = useMemo(
    () => summarizeCredits(cards ?? [], installments ?? [], savings ?? [], payments ?? []),
    [cards, installments, savings, payments],
  )

  // Aparte del desglose por categoría en Análisis, esto responde directo "cuánto pagué de tarjeta
  // este mes" — la tarjeta pagada no suma a totalPendingCents (ya salió como movimiento), así que
  // sin esto ese gasto quedaría sin ningún lugar visible dentro de Créditos.
  const totalPaidCents = useMemo(() => (payments ?? []).reduce((sum, p) => sum + p.amountPaidCents, 0), [payments])

  function openNewCard() {
    setEditingCard(null)
    setCardFormOpen(true)
  }

  function openEditCard(card: CreditCard) {
    setEditingCard(card)
    setCardFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              aria-label="Mes anterior"
              className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
            >
              <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
                <path d="M7.5 2.5 3.5 6l4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <p className="eyebrow">{format(month, 'MMMM yyyy', { locale: es })}</p>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
              className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk"
            >
              <svg viewBox="0 0 12 12" className="size-3.5" aria-hidden>
                <path d="M4.5 2.5 8.5 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <h1 className="mt-2 font-display text-figure font-semibold">Créditos</h1>
          <div className="mt-3">
            <ObligacionesTabs />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openNewCard}>
            Nueva tarjeta
          </Button>
          <Button
            icon={<span className="text-base leading-none">+</span>}
            onClick={() => setPurchaseFormOpen(true)}
            disabled={(cards ?? []).length === 0}
          >
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
      ) : (cards ?? []).length === 0 ? (
        <EmptyState
          glyph="▤"
          title="Todavía no cargaste ninguna tarjeta"
          hint="Cargá tu tarjeta de crédito para anotar las compras en cuotas y saber cuánto debés cada mes."
          action={<Button onClick={openNewCard}>Nueva tarjeta</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel className="p-6 ring-1 ring-acid/15 lg:col-span-1">
              <p className="eyebrow">Total a pagar este mes</p>
              <Money cents={summary.totalPendingCents} tone="chalk" size="figure" className="mt-2" />
              <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Guardado</dt>
                  <dd>
                    <Money cents={summary.totalSavedCents} tone="dim" />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Falta</dt>
                  <dd>
                    <Money cents={summary.totalMissingCents} tone={summary.totalMissingCents > 0 ? 'coral' : 'dim'} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Pagado en tarjetas</dt>
                  <dd>
                    <Money cents={totalPaidCents} tone="dim" />
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel className="p-6 lg:col-span-2">
              <p className="eyebrow">Saldo proyectado a fin de mes</p>
              {isProjectedPending ? (
                <Skeleton className="mt-2 h-9 w-32" />
              ) : (
                <Money cents={projectedBalance ?? 0} tone="chalk" size="figure" className="mt-2" />
              )}
              <p className="mt-3 text-[12px] text-chalk-faint">
                Ya descuenta los fijos, las tarjetas impagas y el gasto variable estimado de este período — el
                mismo número que ves en Fijos.
              </p>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {summary.perCard.map((cardSummary) => (
              <CardCard
                key={cardSummary.card.id}
                summary={cardSummary}
                isCurrentMonth={isCurrentMonth}
                onEdit={openEditCard}
                onOpenDetail={setDetailCard}
                onMarkPaid={setMarkPaidCard}
              />
            ))}
          </div>
        </div>
      )}

      {cardFormOpen && (
        <CreditCardFormDialog open={cardFormOpen} onClose={() => setCardFormOpen(false)} card={editingCard} />
      )}
      {purchaseFormOpen && (
        <PurchaseFormDialog open={purchaseFormOpen} onClose={() => setPurchaseFormOpen(false)} cards={cards ?? []} />
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
    </div>
  )
}
