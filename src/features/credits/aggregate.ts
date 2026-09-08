/**
 * Agregación de Créditos — funciones puras, separadas de la red a propósito (mismo criterio que
 * `savings/aggregate.ts`: así se puede verificar con números a mano sin levantar la app). Las
 * filas de entrada ya vienen resueltas por `v_credit_installments` (la única fuente de verdad de
 * "qué cuota cae en qué mes", ver `period.ts` y la migración) — acá sólo se agrupa y se suma.
 */
import type { CreditCard, CreditCardPayment, CreditCardSaving, CreditInstallment, CreditPurchase, CreditPurchasePayment } from './api'

export interface CardSummary {
  card: CreditCard
  items: CreditInstallment[]
  /** Suma de las cuotas de este mes para esta tarjeta. */
  totalCents: number
  /** Lo que el usuario anotó como ya guardado para este período (0 si no cargó nada). */
  savedCents: number
  /** `totalCents - savedCents`, nunca negativo — lo que falta poner del sueldo. */
  missingCents: number
  /** `savedCents / totalCents * 100`, clampeado a [0, 100]. `0` si `totalCents` es `0` (evita NaN). */
  savedPercent: number
  paid: boolean
  /** Cuándo se marcó pagada, o `null` si no hay pago este período — para mostrar "pagada el D de mes". */
  paidAt: string | null
}

export function summarizeCard(
  card: CreditCard,
  allItems: CreditInstallment[],
  savings: CreditCardSaving[],
  payments: CreditCardPayment[],
): CardSummary {
  const items = allItems
    .filter((i) => i.card_id === card.id)
    .sort((a, b) => b.amountCents - a.amountCents || a.description.localeCompare(b.description))

  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0)
  const savedCents = savings.find((s) => s.card_id === card.id)?.amountCents ?? 0
  const missingCents = Math.max(totalCents - savedCents, 0)
  const savedPercent = totalCents === 0 ? 0 : Math.min(Math.round((savedCents / totalCents) * 100), 100)
  const payment = payments.find((p) => p.card_id === card.id)

  return { card, items, totalCents, savedCents, missingCents, savedPercent, paid: !!payment, paidAt: payment?.paid_at ?? null }
}

export interface PurchaseSummary {
  purchase: CreditPurchase
  /** La cuota de este período para esta compra, o `null` si no tiene (mes anterior al primero, o
   *  posterior al último). Nunca más de un ítem: a diferencia de una tarjeta, una compra suelta no
   *  agrupa nada. */
  item: CreditInstallment | null
  /** `item?.amountCents ?? 0`. */
  totalCents: number
  paid: boolean
}

export function summarizePurchase(
  purchase: CreditPurchase,
  allItems: CreditInstallment[],
  payments: CreditPurchasePayment[],
): PurchaseSummary {
  const item = allItems.find((i) => i.purchase_id === purchase.id) ?? null
  const totalCents = item?.amountCents ?? 0
  const paid = payments.some((p) => p.purchase_id === purchase.id)
  return { purchase, item, totalCents, paid }
}

/** Una `PurchaseSummary` de una compra suelta con cuota en este período — `item` ya no puede ser
 *  `null` acá, a diferencia del tipo general (ver el filtro en `summarizeMisDeudas`). */
export type StandalonePurchaseSummary = PurchaseSummary & { item: CreditInstallment }

export interface MisDeudasSummary {
  perCard: CardSummary[]
  /** Compras sin tarjeta con cuota en este período — las que no tienen (`item === null`) no
   *  aparecen: no hay nada que mostrar ni que pagar este mes. */
  standalone: StandalonePurchaseSummary[]
  /** Suma de `totalCents` de tarjetas y compras sueltas NO pagadas — es lo que efectivamente falta pagar. */
  totalPendingCents: number
  /**
   * Suma de `savedCents`, pero SÓLO de las tarjetas no pagadas — a propósito, no de todas. Marcar
   * una tarjeta como pagada no toca `credit_card_savings` (ver la migración de los RPC): lo
   * guardado de una tarjeta ya pagada queda ahí, pero esa plata ya no está ayudando a cubrir NADA
   * pendiente. Sumarla igual inflaría "Guardado" del panel general sin que "Falta" cierre. Las
   * compras sueltas no tienen "guardado" propio, así que no aportan acá.
   */
  totalSavedCents: number
  /** `totalPendingCents - totalSavedCents`, nunca negativo. */
  totalMissingCents: number
}

export function summarizeMisDeudas(
  cards: CreditCard[],
  standalonePurchases: CreditPurchase[],
  items: CreditInstallment[],
  savings: CreditCardSaving[],
  cardPayments: CreditCardPayment[],
  purchasePayments: CreditPurchasePayment[],
): MisDeudasSummary {
  const perCard = cards.map((c) => summarizeCard(c, items, savings, cardPayments))
  const standalone = standalonePurchases
    .map((p) => summarizePurchase(p, items, purchasePayments))
    .filter((s): s is StandalonePurchaseSummary => s.item !== null)

  const unpaidCards = perCard.filter((c) => !c.paid)
  const unpaidStandalone = standalone.filter((s) => !s.paid)

  const totalPendingCents =
    unpaidCards.reduce((sum, c) => sum + c.totalCents, 0) + unpaidStandalone.reduce((sum, s) => sum + s.totalCents, 0)
  const totalSavedCents = unpaidCards.reduce((sum, c) => sum + c.savedCents, 0)
  const totalMissingCents = Math.max(totalPendingCents - totalSavedCents, 0)

  return { perCard, standalone, totalPendingCents, totalSavedCents, totalMissingCents }
}
