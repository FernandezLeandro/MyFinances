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

/** Lo mínimo que necesita `summarizeFijoVsVariable` — así `useExpenseRowsForClassification`
 *  (`analytics/api.ts`, AN-10) puede pedir sólo estas columnas en vez del `select *` de
 *  `useTransactions`, más liviano para traer TODO el rango sin el tope de 1000 filas. */
export type ClassifiableTransaction = Pick<
  Transaction,
  'id' | 'type' | 'cents' | 'is_adjustment' | 'fixed_expense_payment_id' | 'is_credit_card_payment'
>

/**
 * "Comprometido" = tiene `fixed_expense_payment_id`, o es un pago de tarjeta (`is_credit_card_payment`),
 * o es el pago de una compra en cuotas SIN tarjeta — esas no llevan `is_credit_card_payment` (ver el
 * comentario de `rpc_mark_credit_purchase_paid`: esa columna es sólo para el label "· Tarjeta" de
 * Movimientos, no un clasificador general), así que hace falta el set aparte de
 * `credit_purchase_payments.transaction_id` para no subestimar lo comprometido.
 */
export function summarizeFijoVsVariable(
  transactions: ClassifiableTransaction[],
  committedPurchaseTransactionIds: Set<string>,
): FijoVsVariableSummary {
  let committedCents = 0
  let variableCents = 0

  for (const tx of transactions) {
    // Ajustes de saldo (N7 del re-test de QA): no son ni "comprometido" ni "variable" — son una
    // corrección del punto de partida, no una decisión de gasto real. Mismo criterio que
    // `isRealMovement` en `transactions/aggregate.ts`.
    if (tx.type !== 'expense' || tx.is_adjustment) continue
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
  /** `null` para el grupo "Sin categoría" (`UNCATEGORIZED_ID`) — el componente decide el color de
   *  respaldo. */
  color: string | null
  /** Promedio mensual sobre los meses en que la cuenta tuvo actividad (ver `monthsCounted`), no
   *  sobre los 12 de la ventana. Un mes con gasto en OTRAS categorías sí cuenta acá aunque esta
   *  categoría haya quedado en 0 — de eso se trata: una categoría esporádica tiene que promediar
   *  bajo. Lo que no cuenta son los meses sin ningún movimiento (cuenta nueva, o un mes muerto). */
  avgCents: number
  /** El último mes de la serie (el mes ancla). */
  nowCents: number
  /** `(now - avg) / avg * 100`, redondeado. `null` si `avgCents` es `0` (no hay contra qué comparar). */
  deviationPct: number | null
}

/** Una fila de `v_spend_by_category` por mes, ya resuelta a centavos. `categoryId` es
 *  `UNCATEGORIZED_ID` (nunca `null`) para el grupo "Sin categoría" — ver `toCategorySpendRows` en
 *  `analytics/api.ts` y `useSpendByCategory` en `transactions/api.ts`, que hacen esa conversión. */
export interface CategorySpendRow {
  categoryId: string
  categoryName: string
  /** `null` para "Sin categoría" — el componente que lo pinta decide el color de respaldo (mismo
   *  criterio que "Otros" en el donut de Análisis). */
  color: string | null
  cents: number
}

export interface CategoryMonthlyAverages {
  rows: CategoryMonthlyRow[]
  /** Cuántos de los meses de `monthlySpend` tuvieron algún movimiento en la cuenta (no sólo en esta
   *  categoría) — el divisor real del promedio, y lo que va en la cabecera del panel ("últimos N
   *  meses"). Una cuenta con menos de 12 meses de historia, o con algún mes muerto en el medio, no
   *  puede promediar contra meses que nunca existieron. */
  monthsCounted: number
}

/**
 * Arma el promedio mensual por categoría a partir de N meses de `v_spend_by_category` (uno por mes,
 * mismo orden ascendente que se pidieron). Sólo devuelve categorías con algo de actividad (`avg` o
 * `now` > 0) — una categoría que nunca se usó no aporta nada a la tabla.
 */
export function summarizeCategoryMonthlyAverages(monthlySpend: CategorySpendRow[][]): CategoryMonthlyAverages {
  if (monthlySpend.length === 0) return { rows: [], monthsCounted: 0 }
  const last = monthlySpend[monthlySpend.length - 1]!
  const monthsCounted = monthlySpend.filter((month) => month.some((r) => r.cents > 0)).length
  const divisor = Math.max(1, monthsCounted)

  const rows = last
    .map((row): CategoryMonthlyRow => {
      const sum = monthlySpend.reduce((acc, month) => acc + (month.find((r) => r.categoryId === row.categoryId)?.cents ?? 0), 0)
      const avgCents = Math.round(sum / divisor)
      const nowCents = row.cents
      const deviationPct = avgCents > 0 ? Math.round(((nowCents - avgCents) / avgCents) * 100) : null
      return { categoryId: row.categoryId, categoryName: row.categoryName, color: row.color, avgCents, nowCents, deviationPct }
    })
    .filter((row) => row.avgCents > 0 || row.nowCents > 0)
    .sort((a, b) => b.nowCents - a.nowCents)

  return { rows, monthsCounted }
}
