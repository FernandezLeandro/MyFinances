/**
 * Agregación de Análisis — función pura, separada de la red a propósito (mismo criterio que
 * `credits/aggregate.ts` y `fixed-expenses/aggregate.ts`).
 */
import type { Transaction } from '@/features/transactions/api'

export interface FijoVsVariableSummary {
  /** Gasto que ya estaba decidido antes de que arrancara el período: pagos de fijos, de tarjeta y
   *  de compras en cuotas sin tarjeta. */
  committedCents: number
  /** El resto — lo que decidiste gastar dentro del período. */
  variableCents: number
  totalCents: number
  /** 0-100, redondeado. `0` en los dos si `totalCents` es `0` (evita NaN). */
  committedPct: number
  variablePct: number
}

/**
 * "Comprometido" = tiene `fixed_expense_payment_id`, o es un pago de tarjeta (`is_credit_card_payment`),
 * o es el pago de una compra en cuotas SIN tarjeta — esas no llevan `is_credit_card_payment` (ver el
 * comentario de `rpc_mark_credit_purchase_paid`: esa columna es sólo para el label "· Tarjeta" de
 * Movimientos, no un clasificador general), así que hace falta el set aparte de
 * `credit_purchase_payments.transaction_id` para no subestimar lo comprometido.
 */
export function summarizeFijoVsVariable(
  transactions: Transaction[],
  committedPurchaseTransactionIds: Set<string>,
): FijoVsVariableSummary {
  let committedCents = 0
  let variableCents = 0

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const committed =
      tx.fixed_expense_payment_id != null || tx.is_credit_card_payment || committedPurchaseTransactionIds.has(tx.id)
    if (committed) committedCents += tx.cents
    else variableCents += tx.cents
  }

  const totalCents = committedCents + variableCents
  const committedPct = totalCents > 0 ? Math.round((committedCents / totalCents) * 100) : 0
  const variablePct = totalCents > 0 ? 100 - committedPct : 0

  return { committedCents, variableCents, totalCents, committedPct, variablePct }
}

export interface CategoryMonthlyRow {
  categoryId: string
  categoryName: string
  color: string
  /** Promedio mensual sobre los meses de la serie (`sum / months.length`), no sólo los meses con
   *  gasto — un mes en 0 sigue contando como un mes sin gastar en esa categoría. */
  avgCents: number
  /** El último mes de la serie (el mes ancla). */
  nowCents: number
  /** `(now - avg) / avg * 100`, redondeado. `null` si `avgCents` es `0` (no hay contra qué comparar). */
  deviationPct: number | null
}

/** Una fila de `v_spend_by_category` por mes, ya resuelta a centavos. */
export interface CategorySpendRow {
  categoryId: string
  categoryName: string
  color: string
  cents: number
}

/**
 * Arma el promedio mensual por categoría a partir de N meses de `v_spend_by_category` (uno por mes,
 * mismo orden ascendente que se pidieron). Sólo devuelve categorías con algo de actividad (`avg` o
 * `now` > 0) — una categoría que nunca se usó no aporta nada a la tabla.
 */
export function summarizeCategoryMonthlyAverages(monthlySpend: CategorySpendRow[][]): CategoryMonthlyRow[] {
  if (monthlySpend.length === 0) return []
  const last = monthlySpend[monthlySpend.length - 1]!

  return last
    .map((row): CategoryMonthlyRow => {
      const sum = monthlySpend.reduce((acc, month) => acc + (month.find((r) => r.categoryId === row.categoryId)?.cents ?? 0), 0)
      const avgCents = Math.round(sum / monthlySpend.length)
      const nowCents = row.cents
      const deviationPct = avgCents > 0 ? Math.round(((nowCents - avgCents) / avgCents) * 100) : null
      return { categoryId: row.categoryId, categoryName: row.categoryName, color: row.color, avgCents, nowCents, deviationPct }
    })
    .filter((row) => row.avgCents > 0 || row.nowCents > 0)
    .sort((a, b) => b.nowCents - a.nowCents)
}
