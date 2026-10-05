/**
 * Agregación de Créditos — funciones puras, separadas de la red a propósito (mismo criterio que
 * `savings/aggregate.ts`: así se puede verificar con números a mano sin levantar la app). Las
 * filas de entrada ya vienen resueltas por `v_credit_installments_range` (la única fuente de verdad
 * de "qué cuota cae en qué rango, con qué vencimiento", ver `period.ts` y la migración) — acá sólo
 * se agrupa y se suma.
 *
 * El guardado es por compra (`credit_savings`, `20261004010001_deudas_guardado_por_compra.sql`): el de
 * una tarjeta es la suma de lo guardado en sus compras. Mismo modelo que los guardados de Fijos — sólo
 * lo guardado CON movimiento ya salió del saldo, así que sólo eso baja lo que falta pagar.
 */
import type { CreditCard, CreditCardPayment, CreditInstallmentRange, CreditPurchase, CreditPurchasePayment, CreditSaving } from './api'

/** Una cuota del período con lo que se guardó para ella. */
export type SavedInstallment = CreditInstallmentRange & {
  /** Todos los aportes de esta cuota, en el orden en que se cargaron — para listarlos y quitarlos. */
  savings: CreditSaving[]
  /** Todo lo guardado (con y sin movimiento), sin capar — puede pasarse de la cuota. */
  savedCents: number
  /** Lo que todavía falta pagar: `max(cuota − savedCents, 0)`. Todo lo guardado descuenta, tenga
   *  movimiento o no (el movimiento sólo decide cuándo baja el saldo). Es lo que genera el pago
   *  (`rpc_mark_credit_card_paid`/`rpc_mark_credit_purchase_paid`) y lo que resta el proyectado
   *  (`credit_saving_covered`). */
  pendingCents: number
}

function withSavings(item: CreditInstallmentRange, savings: CreditSaving[]): SavedInstallment {
  const own = savings.filter((s) => s.purchase_id === item.purchase_id && s.period === item.period)
  const savedCents = own.reduce((sum, s) => sum + s.amountCents, 0)
  return { ...item, savings: own, savedCents, pendingCents: Math.max(item.amountCents - savedCents, 0) }
}

/** Lo que tienen en común una tarjeta y una compra suelta: totales del período y estado de pago. */
interface DebtTotals {
  /** Suma de las cuotas del período. */
  totalCents: number
  /** Suma de lo guardado en sus cuotas (con y sin movimiento). */
  savedCents: number
  /** Suma de `pendingCents` de sus cuotas — lo que genera el pago. */
  pendingCents: number
  /** `totalCents - savedCents`, nunca negativo — lo que falta poner. */
  missingCents: number
  /** `savedCents / totalCents * 100`, clampeado a [0, 100]. `0` si `totalCents` es `0` (evita NaN). */
  savedPercent: number
  paid: boolean
  /** El vencimiento materializado más próximo (`'yyyy-MM-dd'`), para `fixedExpenseUrgency`. `null`
   *  sin cuotas o sin día de vencimiento (en la base, esas cuotas caen a fin de mes). */
  dueOn: string | null
}

function totalsOf(items: SavedInstallment[]): Pick<DebtTotals, 'totalCents' | 'savedCents' | 'pendingCents' | 'missingCents' | 'savedPercent'> {
  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0)
  const savedCents = items.reduce((sum, i) => sum + i.savedCents, 0)
  return {
    totalCents,
    savedCents,
    pendingCents: items.reduce((sum, i) => sum + i.pendingCents, 0),
    missingCents: Math.max(totalCents - savedCents, 0),
    savedPercent: totalCents === 0 ? 0 : Math.min(Math.round((savedCents / totalCents) * 100), 100),
  }
}

export interface CardSummary extends DebtTotals {
  card: CreditCard
  items: SavedInstallment[]
  /** `items.length > 0` — HO-03 del QA de Hoy: una tarjeta sin ninguna cuota este período no es una
   *  deuda pendiente, aunque `paid` dé `false` (no hay pago porque no hay nada que pagar). */
  hasDue: boolean
  /** Cuándo se marcó pagada, o `null` si no hay pago este período — para mostrar "pagada el D de mes". */
  paidAt: string | null
}

export function summarizeCard(
  card: CreditCard,
  allItems: CreditInstallmentRange[],
  savings: CreditSaving[],
  payments: CreditCardPayment[],
): CardSummary {
  const items = allItems
    .filter((i) => i.card_id === card.id)
    .sort((a, b) => b.amountCents - a.amountCents || a.description.localeCompare(b.description))
    .map((i) => withSavings(i, savings))

  // Casi siempre hay un único vencimiento (un mes calendario nunca tiene dos de la misma tarjeta);
  // con un ciclo semanal a caballo de dos meses (bloque 5 del plan) puede haber dos y se toma el más
  // próximo. Sin día de vencimiento, nada que marcar como urgente.
  const dueOn =
    card.due_day != null && items.length ? items.reduce((min, i) => (i.due_on < min ? i.due_on : min), items[0].due_on) : null

  // Una tarjeta suele tener un único `period` entre sus `items` (un mes calendario nunca lo cruza) —
  // acá el match por `card_id` solo ya alcanzaba. Con un ciclo semanal a caballo de dos meses puede
  // haber DOS resúmenes distintos en la misma vista (bloque 5 del plan): "pagada" exige que cada uno
  // tenga su propio pago, no cualquiera. Sin `items` (nada que vencer este ciclo) se preserva el
  // comportamiento de siempre — cualquier pago de la tarjeta cuenta, aunque no haya cuota a la vista.
  const relevantPayments = payments.filter((p) => p.card_id === card.id)
  const periods = [...new Set(items.map((i) => i.period))]
  const paid = periods.length === 0 ? relevantPayments.length > 0 : periods.every((period) => relevantPayments.some((p) => p.period === period))
  const paidAt = relevantPayments[0]?.paid_at ?? null

  return { card, items, ...totalsOf(items), paid, hasDue: items.length > 0, paidAt, dueOn }
}

export interface PurchaseSummary extends DebtTotals {
  purchase: CreditPurchase
  /** La cuota de este período para esta compra, o `null` si no tiene (mes anterior al primero, o
   *  posterior al último). Nunca más de un ítem: a diferencia de una tarjeta, una compra suelta no
   *  agrupa nada. */
  item: SavedInstallment | null
}

export function summarizePurchase(
  purchase: CreditPurchase,
  allItems: CreditInstallmentRange[],
  savings: CreditSaving[],
  payments: CreditPurchasePayment[],
): PurchaseSummary {
  const raw = allItems.find((i) => i.purchase_id === purchase.id)
  const item = raw ? withSavings(raw, savings) : null
  const relevantPayments = payments.filter((p) => p.purchase_id === purchase.id)
  const paid = item ? relevantPayments.some((p) => p.period === item.period) : relevantPayments.length > 0
  const dueOn = item && purchase.due_day != null ? item.due_on : null
  return { purchase, item, ...totalsOf(item ? [item] : []), paid, dueOn }
}

/** Una `PurchaseSummary` de una compra suelta con cuota en este período — `item` ya no puede ser
 *  `null` acá, a diferencia del tipo general (ver el filtro en `summarizeMisDeudas`). */
export type StandalonePurchaseSummary = PurchaseSummary & { item: SavedInstallment }

export interface MisDeudasSummary {
  perCard: CardSummary[]
  /** Compras sin tarjeta con cuota en este período — las que no tienen (`item === null`) no
   *  aparecen: no hay nada que mostrar ni que pagar este mes. */
  standalone: StandalonePurchaseSummary[]
  /** Suma bruta de las cuotas de tarjetas y compras sueltas NO pagadas — el "a pagar" del hero. */
  totalDueCents: number
  /** Lo guardado para lo NO pagado, sin pasarse de cada deuda — lo guardado de una ya pagada no
   *  está ayudando a cubrir nada pendiente, y guardar de más en una no cubre otra. */
  totalSavedCents: number
  /** `totalDueCents - totalSavedCents`, nunca negativo. */
  totalMissingCents: number
  /** Lo que todavía falta pagar por lo NO pagado: el bruto menos todo lo guardado. Espeja el término de deudas de `rpc_projected_balance_range` — es lo
   *  que muestra «Deudas por pagar» en `SaldoProyectadoPanel`, para que el desglose cierre. */
  totalPendingCents: number
  /** HO-03 del QA de Hoy: cuántas tarjetas y compras sueltas están efectivamente impagas — una
   *  tarjeta sin `hasDue` (sin ninguna cuota este período) no cuenta, aunque `paid` dé `false`. Las
   *  compras sueltas siempre tienen cuota (`standalone` ya las filtra). */
  unpaidCount: number
}

export function summarizeMisDeudas(
  cards: CreditCard[],
  standalonePurchases: CreditPurchase[],
  items: CreditInstallmentRange[],
  savings: CreditSaving[],
  cardPayments: CreditCardPayment[],
  purchasePayments: CreditPurchasePayment[],
): MisDeudasSummary {
  const perCard = cards.map((c) => summarizeCard(c, items, savings, cardPayments))
  const standalone = standalonePurchases
    .map((p) => summarizePurchase(p, items, savings, purchasePayments))
    .filter((s): s is StandalonePurchaseSummary => s.item !== null)

  const unpaid: DebtTotals[] = [...perCard.filter((c) => !c.paid), ...standalone.filter((s) => !s.paid)]
  const totalDueCents = unpaid.reduce((sum, d) => sum + d.totalCents, 0)
  const totalSavedCents = unpaid.reduce((sum, d) => sum + Math.min(d.savedCents, d.totalCents), 0)

  return {
    perCard,
    standalone,
    totalDueCents,
    totalSavedCents,
    totalMissingCents: Math.max(totalDueCents - totalSavedCents, 0),
    totalPendingCents: unpaid.reduce((sum, d) => sum + d.pendingCents, 0),
    unpaidCount: perCard.filter((c) => !c.paid && c.hasDue).length + standalone.filter((s) => !s.paid).length,
  }
}

/** Una deuda de la lista de Mis Deudas: una tarjeta o una compra sin tarjeta. */
export type Debt = { kind: 'card'; summary: CardSummary } | { kind: 'purchase'; summary: StandalonePurchaseSummary }

export function debtName(debt: Debt): string {
  return debt.kind === 'card' ? debt.summary.card.name : debt.summary.purchase.description
}

export function debtItems(debt: Debt): SavedInstallment[] {
  return debt.kind === 'card' ? debt.summary.items : [debt.summary.item]
}

/**
 * La lista única de Mis Deudas (tarjetas y compras sueltas mezcladas), partida en impagas y pagadas.
 * Impagas por vencimiento, las sin día al final; una tarjeta sin cuotas este ciclo va última de todo
 * (no es una deuda, pero tiene que seguir a mano para editarla o cargarle una compra).
 */
export function debtList(summary: MisDeudasSummary): { unpaid: Debt[]; paid: Debt[] } {
  const all: Debt[] = [
    ...summary.perCard.map((summary): Debt => ({ kind: 'card', summary })),
    ...summary.standalone.map((summary): Debt => ({ kind: 'purchase', summary })),
  ]
  const rank = (d: Debt) => (d.kind === 'card' && !d.summary.hasDue ? 2 : d.summary.dueOn == null ? 1 : 0)
  const byDue = (a: Debt, b: Debt) =>
    rank(a) - rank(b) || (a.summary.dueOn ?? '').localeCompare(b.summary.dueOn ?? '') || debtName(a).localeCompare(debtName(b))
  return {
    unpaid: all.filter((d) => !d.summary.paid).sort(byDue),
    paid: all.filter((d) => d.summary.paid && d.summary.totalCents > 0).sort(byDue),
  }
}

export interface PaymentGroup {
  categoryId: string | null
  /** Las cuotas de esta categoría que todavía tienen algo por pagar. */
  items: SavedInstallment[]
  /** Suma de sus `pendingCents` — el importe del movimiento que va a generar. */
  totalCents: number
}

/**
 * Qué movimientos va a generar pagar una tarjeta — espejo del bucle de `rpc_mark_credit_card_paid`:
 * uno por categoría, por lo que le falta a cada cuota. Una cuota guardada entera (con o sin movimiento)
 * queda afuera y aparece en `covered`; una categoría sin nada por pagar no genera movimiento.
 */
export function paymentGroups(items: SavedInstallment[]): { groups: PaymentGroup[]; covered: SavedInstallment[] } {
  const byCategory = new Map<string | null, SavedInstallment[]>()
  for (const item of items) {
    if (item.pendingCents === 0) continue
    byCategory.set(item.category_id, [...(byCategory.get(item.category_id) ?? []), item])
  }
  const groups = [...byCategory.entries()]
    .map(([categoryId, groupItems]) => ({
      categoryId,
      items: groupItems.sort((a, b) => b.pendingCents - a.pendingCents),
      totalCents: groupItems.reduce((sum, i) => sum + i.pendingCents, 0),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
  return { groups, covered: items.filter((i) => i.pendingCents === 0) }
}
