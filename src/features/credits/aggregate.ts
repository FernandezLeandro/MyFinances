/**
 * Agregación de Créditos — funciones puras, separadas de la red a propósito (mismo criterio que
 * `savings/aggregate.ts`: así se puede verificar con números a mano sin levantar la app). Las
 * filas de entrada ya vienen resueltas por `v_credit_installments_range` (la única fuente de verdad
 * de "qué cuota cae en qué rango, con qué vencimiento", ver `period.ts` y la migración) — acá sólo
 * se agrupa y se suma.
 */
import type { CreditCard, CreditCardPayment, CreditCardSaving, CreditInstallmentRange, CreditPurchase, CreditPurchasePayment } from './api'

export interface CardSummary {
  card: CreditCard
  items: CreditInstallmentRange[]
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
  /** El vencimiento materializado más próximo entre `items` (`'yyyy-MM-dd'`), o `null` sin ítems —
   *  para `fixedExpenseUrgency`. Casi siempre hay uno solo (un mes calendario nunca tiene dos
   *  vencimientos de la misma tarjeta); con un ciclo semanal a caballo de dos meses (bloque 5 del
   *  plan) puede haber dos resúmenes distintos y se toma el más próximo. */
  dueOn: string | null
}

export function summarizeCard(
  card: CreditCard,
  allItems: CreditInstallmentRange[],
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
  const dueOn = items.length ? items.reduce((min, i) => (i.due_on < min ? i.due_on : min), items[0].due_on) : null

  // Una tarjeta suele tener un único `period` entre sus `items` (un mes calendario nunca lo cruza) —
  // acá el match por `card_id` solo ya alcanzaba. Con un ciclo semanal a caballo de dos meses puede
  // haber DOS resúmenes distintos en la misma vista (bloque 5 del plan): "pagada" exige que cada uno
  // tenga su propio pago, no cualquiera. Sin `items` (nada que vencer este ciclo) se preserva el
  // comportamiento de siempre — cualquier pago de la tarjeta cuenta, aunque no haya cuota a la vista.
  const relevantPayments = payments.filter((p) => p.card_id === card.id)
  const periods = [...new Set(items.map((i) => i.period))]
  const paid = periods.length === 0 ? relevantPayments.length > 0 : periods.every((period) => relevantPayments.some((p) => p.period === period))
  const paidAt = relevantPayments[0]?.paid_at ?? null

  return { card, items, totalCents, savedCents, missingCents, savedPercent, paid, paidAt, dueOn }
}

export interface PurchaseSummary {
  purchase: CreditPurchase
  /** La cuota de este período para esta compra, o `null` si no tiene (mes anterior al primero, o
   *  posterior al último). Nunca más de un ítem: a diferencia de una tarjeta, una compra suelta no
   *  agrupa nada. */
  item: CreditInstallmentRange | null
  /** `item?.amountCents ?? 0`. */
  totalCents: number
  paid: boolean
  /** `item?.due_on ?? null` — para `fixedExpenseUrgency`. */
  dueOn: string | null
}

export function summarizePurchase(
  purchase: CreditPurchase,
  allItems: CreditInstallmentRange[],
  payments: CreditPurchasePayment[],
): PurchaseSummary {
  const item = allItems.find((i) => i.purchase_id === purchase.id) ?? null
  const totalCents = item?.amountCents ?? 0
  const relevantPayments = payments.filter((p) => p.purchase_id === purchase.id)
  const paid = item ? relevantPayments.some((p) => p.period === item.period) : relevantPayments.length > 0
  return { purchase, item, totalCents, paid, dueOn: item?.due_on ?? null }
}

/** Una `PurchaseSummary` de una compra suelta con cuota en este período — `item` ya no puede ser
 *  `null` acá, a diferencia del tipo general (ver el filtro en `summarizeMisDeudas`). */
export type StandalonePurchaseSummary = PurchaseSummary & { item: CreditInstallmentRange }

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
  items: CreditInstallmentRange[],
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
