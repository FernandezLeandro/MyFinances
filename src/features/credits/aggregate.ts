/**
 * Agregación de Créditos — funciones puras, separadas de la red a propósito (mismo criterio que
 * `savings/aggregate.ts`: así se puede verificar con números a mano sin levantar la app). Las
 * filas de entrada ya vienen resueltas por `v_credit_installments` (la única fuente de verdad de
 * "qué cuota cae en qué mes", ver `period.ts` y la migración) — acá sólo se agrupa y se suma.
 */
import type { CreditCard, CreditCardPayment, CreditCardSaving, CreditInstallment } from './api'

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
  const paid = payments.some((p) => p.card_id === card.id)

  return { card, items, totalCents, savedCents, missingCents, savedPercent, paid }
}

export interface CreditsSummary {
  perCard: CardSummary[]
  /** Suma de `totalCents` de las tarjetas NO pagadas — es lo que efectivamente falta pagar. */
  totalPendingCents: number
  /**
   * Suma de `savedCents`, pero SÓLO de las tarjetas no pagadas — a propósito, no de todas.
   * Marcar una tarjeta como pagada no toca `credit_card_savings` (ver la migración de los RPC):
   * lo guardado de una tarjeta ya pagada queda ahí, pero esa plata ya no está ayudando a cubrir
   * NADA pendiente. Sumarla igual inflaría "Guardado" del panel general sin que "Falta" cierre.
   */
  totalSavedCents: number
  /** `totalPendingCents - totalSavedCents`, nunca negativo. */
  totalMissingCents: number
}

export function summarizeCredits(
  cards: CreditCard[],
  items: CreditInstallment[],
  savings: CreditCardSaving[],
  payments: CreditCardPayment[],
): CreditsSummary {
  const perCard = cards.map((c) => summarizeCard(c, items, savings, payments))
  const unpaid = perCard.filter((c) => !c.paid)
  const totalPendingCents = unpaid.reduce((sum, c) => sum + c.totalCents, 0)
  const totalSavedCents = unpaid.reduce((sum, c) => sum + c.savedCents, 0)
  const totalMissingCents = Math.max(totalPendingCents - totalSavedCents, 0)
  return { perCard, totalPendingCents, totalSavedCents, totalMissingCents }
}
