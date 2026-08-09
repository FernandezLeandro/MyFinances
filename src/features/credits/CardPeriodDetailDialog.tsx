import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProgresoGuardado } from '@/features/credits/ProgresoGuardado'
import { etiquetaCuota } from '@/features/credits/format'
import { useCategories } from '@/features/categories/api'
import {
  useCreditCardPayments,
  useCreditPurchases,
  useUnmarkCreditCardPaid,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'
import type { CardSummary } from '@/features/credits/aggregate'
import { PurchaseFormDialog } from '@/features/credits/PurchaseFormDialog'
import { SavedAmountDialog } from '@/features/credits/SavedAmountDialog'
import { MarkCardPaidDialog } from '@/features/credits/MarkCardPaidDialog'

interface CardPeriodDetailDialogProps {
  open: boolean
  onClose: () => void
  card: CreditCard
  period: string
  summary: CardSummary | null
}

type Child = 'purchase' | 'saved' | 'markPaid' | null

/** Detalle de una tarjeta en un mes: qué cuotas caen, cuánto se guardó, y desde acá se entra a
 *  editar cada compra, cargar lo guardado, o marcar/desmarcar el pago. Aplica el patrón de
 *  `BucketDetailDialog`/`FixedExpenseDetailDialog` para diálogos anidados: `open={open && !child}`,
 *  un `handleClose` que filtra, y el hijo montado condicionalmente como hermano — sin esto, abrir
 *  cualquiera de los tres de acá adentro cerraría este detalle de un tirón. */
export function CardPeriodDetailDialog({ open, onClose, card, period, summary }: CardPeriodDetailDialogProps) {
  const [child, setChild] = useState<Child>(null)
  const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null)

  const { data: purchases } = useCreditPurchases(card.id)
  const { data: payments } = useCreditCardPayments(period)
  const { data: categories } = useCategories()
  const unmarkPaid = useUnmarkCreditCardPaid()

  const purchaseById = useMemo(() => new Map((purchases ?? []).map((p) => [p.id, p])), [purchases])
  const categoryById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const payment = (payments ?? []).find((p) => p.card_id === card.id)

  function handleClose() {
    if (child === null) onClose()
  }

  function closeChild() {
    setChild(null)
    setEditingPurchase(null)
  }

  function openNewPurchase() {
    setEditingPurchase(null)
    setChild('purchase')
  }

  function openEditPurchase(purchaseId: string | null) {
    const purchase = purchaseId ? purchaseById.get(purchaseId) : undefined
    if (!purchase) return
    setEditingPurchase(purchase)
    setChild('purchase')
  }

  const items = summary?.items ?? []
  const totalCents = summary?.totalCents ?? 0
  const paid = summary?.paid ?? false

  return (
    <>
      <Dialog
        open={open && child === null}
        onClose={handleClose}
        title={card.name}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} className="mr-auto">
              Cerrar
            </Button>
            {paid ? (
              <Button variant="danger" onClick={() => unmarkPaid.mutate({ cardId: card.id, period })} disabled={unmarkPaid.isPending}>
                Desmarcar pagada
              </Button>
            ) : (
              <Button onClick={() => setChild('markPaid')} disabled={totalCents === 0}>
                Marcar pagada
              </Button>
            )}
          </>
        }
      >
        <div className="mb-5 border-b border-ink-850 pb-5">
          <p className="eyebrow">Total este mes</p>
          <Money cents={totalCents} tone={paid ? 'dim' : 'chalk'} size="figure" className="mt-1" />
          {paid && payment && (
            <p className="mt-2 text-[12px] text-acid">
              Pagada — se abonó <Money cents={payment.amountPaidCents} tone="dim" size="inline" />
            </p>
          )}

          {!paid && totalCents > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] text-chalk-faint">
                  Guardaste <Money cents={summary?.savedCents ?? 0} tone="dim" size="inline" /> · faltan{' '}
                  <Money cents={summary?.missingCents ?? 0} tone={(summary?.missingCents ?? 0) > 0 ? 'coral' : 'dim'} size="inline" />
                </p>
                <button type="button" onClick={() => setChild('saved')} className="text-[12px] font-medium text-acid hover:underline">
                  Editar
                </button>
              </div>
              <div className="mt-2">
                <ProgresoGuardado percent={summary?.savedPercent ?? 0} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Cuotas de este mes</p>
          <button type="button" onClick={openNewPurchase} className="text-[12px] font-medium text-acid hover:underline">
            Nueva compra
          </button>
        </div>

        {items.length === 0 ? (
          <EmptyState glyph="▤" title="Sin cuotas este mes" hint="Cargá una compra para verla acá." />
        ) : (
          <ul className="-mx-6 mt-2 flex max-h-[40vh] flex-col overflow-y-auto">
            {items.map((item) => (
              <li key={item.purchase_id ?? `${item.description}-${item.installment_no}`} className="border-t border-ink-850 first:border-t-0">
                <button
                  type="button"
                  onClick={() => openEditPurchase(item.purchase_id)}
                  disabled={!item.purchase_id}
                  className="flex w-full items-center gap-3 px-6 py-3 text-left transition-colors duration-150 hover:bg-ink-850 disabled:hover:bg-transparent"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryById.get(item.category_id ?? '')?.color ?? 'var(--color-ink-600)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-chalk">
                      {item.description} <span className="text-chalk-faint">{etiquetaCuota(item.installment_no, item.installments)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-chalk-faint">
                      {categoryById.get(item.category_id ?? '')?.name ?? 'Sin categoría'}
                    </p>
                  </div>
                  <Money cents={item.amountCents} tone="dim" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {child === 'purchase' && (
        <PurchaseFormDialog open onClose={closeChild} cards={[card]} purchase={editingPurchase} defaultCardId={card.id} />
      )}
      {child === 'saved' && (
        <SavedAmountDialog open onClose={closeChild} card={card} period={period} savedCents={summary?.savedCents ?? 0} />
      )}
      {child === 'markPaid' && <MarkCardPaidDialog open onClose={closeChild} card={card} period={period} summary={summary} />}
    </>
  )
}
