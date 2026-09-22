/**
 * Agregación de Movimientos — funciones puras, separadas de la red (mismo criterio que ya usan
 * fixed-expenses, credits, receivables y savings en su propio `aggregate.ts`). Trabajan sobre la
 * lista YA filtrada que devuelve `useTransactions` (búsqueda, tipo, categorías, cuentas) — así el
 * resumen de la pantalla siempre coincide con lo que se ve en la tabla de abajo, en vez de
 * recalcularse aparte con un criterio propio.
 */
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Transaction } from './api'

export interface TransactionsSummary {
  totalIncomeCents: number
  totalExpenseCents: number
  netCents: number
  incomeCount: number
  expenseCount: number
  /** `totalExpenseCents / diasTranscurridos`, 0 si el período todavía no arrancó. */
  dailyAverageExpenseCents: number
  /** Días ya transcurridos del período a esta altura de `today` — el mes en curso cuenta hasta hoy,
   *  no hasta su último día (gastar $50.000 en 5 días de septiembre promedia sobre 5, no sobre 30). */
  daysElapsed: number
}

/** Ajustes de saldo (`is_adjustment`) quedan afuera: no son plata que "se fue", son una corrección
 *  del punto de partida — mismo criterio que ya aplica el resto de la app (ver `TransactionRow`). */
function isRealMovement(tx: Transaction): boolean {
  return !tx.is_adjustment
}

export function summarizeTransactions(transactions: Transaction[], from: string, to: string, today: Date): TransactionsSummary {
  let totalIncomeCents = 0
  let totalExpenseCents = 0
  let incomeCount = 0
  let expenseCount = 0

  for (const tx of transactions) {
    if (!isRealMovement(tx)) continue
    if (tx.type === 'income') {
      totalIncomeCents += tx.cents
      incomeCount++
    } else {
      totalExpenseCents += tx.cents
      expenseCount++
    }
  }

  const fromDate = parseISO(from)
  const toDate = parseISO(to)
  // El período puede terminar en el futuro (el mes en curso) — ahí el promedio es sobre lo
  // transcurrido, no sobre el mes entero. Si el período todavía no arrancó, 0 días (evita
  // dividir por un número negativo).
  const effectiveEnd = toDate < today ? toDate : today
  const daysElapsed = Math.max(differenceInCalendarDays(effectiveEnd, fromDate) + 1, 0)

  return {
    totalIncomeCents,
    totalExpenseCents,
    netCents: totalIncomeCents - totalExpenseCents,
    incomeCount,
    expenseCount,
    dailyAverageExpenseCents: daysElapsed > 0 ? Math.round(totalExpenseCents / daysElapsed) : 0,
    daysElapsed,
  }
}

/** El texto secundario de una fila de movimiento: "Ajuste de saldo · afuera de Análisis" para un
 *  ajuste, "{categoría} · Tarjeta" para un pago de tarjeta, o la categoría a secas. Compartido entre
 *  `TransactionRow` (Hoy y Movimientos en mobile) y la fila ancha de escritorio de Movimientos — N7
 *  del re-test de QA: esta última no tenía la rama de ajuste y mostraba "Sin categoría" como si
 *  fuera un gasto común, con el monto completo del ajuste sumado al total del día. */
export function movementCategoryLabel(
  tx: Pick<Transaction, 'is_adjustment' | 'is_credit_card_payment'>,
  categoryName: string | undefined,
): string {
  if (tx.is_adjustment) return 'Ajuste de saldo · afuera de Análisis'
  if (tx.is_credit_card_payment) return `${categoryName ?? 'Sin categoría'} · Tarjeta`
  return categoryName ?? 'Sin categoría'
}

export interface DailySpendBar {
  /** Fecha del día, `'yyyy-MM-dd'` — clave de `key` y de orden, y lo que arma el label. */
  date: string
  /** Día del mes (1-31), sólo para el label corto ("pico el 5") cuando el rango completo no cruza
   *  el borde del mes — ver `dailySpendPeakLabel`. Con un rango que sí cruza (ciclo semanal, bloque
   *  5 del plan) dos barras pueden compartir este número sin ser el mismo día — por eso el label
   *  usa `date` entera en ese caso, nunca esto solo. */
  day: number
  cents: number
}

/** Gasto por día del período, un slot por cada día del rango — un día sin movimientos queda en 0,
 *  no ausente, así el gráfico de barras nunca tiene huecos. Pensado para un período de un mes; con
 *  un rango más largo (año, personalizado) sigue siendo correcto pero deja de tener 30 barras. */
export function dailySpendBars(transactions: Transaction[], from: string, to: string): DailySpendBar[] {
  const totalsByDay = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !isRealMovement(tx)) continue
    totalsByDay.set(tx.occurred_on, (totalsByDay.get(tx.occurred_on) ?? 0) + tx.cents)
  }

  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((date) => {
    const iso = format(date, 'yyyy-MM-dd')
    return { date: iso, day: date.getDate(), cents: totalsByDay.get(iso) ?? 0 }
  })
}

/** Neto de cada día, EXCLUYENDO ajustes (N7 del QA) — un ajuste de saldo es una corrección del
 *  punto de partida, no plata que "se movió" ese día, así que no debería inflar (ni desinflar) el
 *  subtotal del grupo de ese día en Movimientos. Mismo criterio que ya aplica `summarizeTransactions`
 *  al neto del período entero; esto es el equivalente por día, para el `GroupHeader` de cada grupo. */
export function dayNetTotals(transactions: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (!isRealMovement(tx)) continue
    const delta = tx.type === 'income' ? tx.cents : -tx.cents
    totals.set(tx.occurred_on, (totals.get(tx.occurred_on) ?? 0) + delta)
  }
  return totals
}

/** Label del "pico" del gráfico de barras — sólo el día ("5") cuando todas las barras caen en el
 *  mismo mes, con el mes agregado ("29 sep") cuando el rango lo cruza (ciclo semanal, bloque 5 del
 *  plan) — dos barras de meses distintos pueden compartir número de día, y sin el mes el label
 *  miente sobre cuál de las dos es. */
export function dailySpendPeakLabel(bar: DailySpendBar, sameMonth: boolean): string {
  if (sameMonth) return String(bar.day)
  return format(parseISO(bar.date), 'd MMM', { locale: es })
}
