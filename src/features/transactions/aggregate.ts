/**
 * Agregación de Movimientos — funciones puras, separadas de la red (mismo criterio que ya usan
 * fixed-expenses, credits, receivables y savings en su propio `aggregate.ts`). Trabajan sobre la
 * lista YA filtrada que devuelve `useTransactions` (búsqueda, tipo, categorías, cuentas) — así el
 * resumen de la pantalla siempre coincide con lo que se ve en la tabla de abajo, en vez de
 * recalcularse aparte con un criterio propio.
 */
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AccountTransfer } from '@/features/accounts/transfers-api'
import type { Transaction, TransactionType } from './api'

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
 *  al neto del período entero; esto es el equivalente por día, para el `GroupHeader` de cada grupo.
 *
 *  Las transferencias suman con el signo de `transferSignedCents`: sin filtro de cuenta valen 0 (la
 *  plata no sale del conjunto), filtrando por una cuenta sí mueven su total del día. */
export function dayNetTotals(
  transactions: readonly Transaction[],
  transfers: readonly AccountTransfer[] = [],
  accountIds: readonly string[] = [],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (!isRealMovement(tx)) continue
    const delta = tx.type === 'income' ? tx.cents : -tx.cents
    totals.set(tx.occurred_on, (totals.get(tx.occurred_on) ?? 0) + delta)
  }
  for (const transfer of transfers) {
    const delta = transferSignedCents(transfer, accountIds)
    if (delta === 0) continue
    totals.set(transfer.occurred_on, (totals.get(transfer.occurred_on) ?? 0) + delta)
  }
  return totals
}

// ---------------------------------------------------------------------------------------------
// Transferencias en la lista de Movimientos
// ---------------------------------------------------------------------------------------------
//
// Las transferencias viven en `account_transfers`, no en `transactions`, para que ningún total de
// la app las lea (ver la migración `cuentas_y_medios_de_pago`). Movimientos las MUESTRA mezcladas
// con los movimientos, pero sólo en la lista: el resumen del período, las barras y el CSV siguen
// trabajando sobre `transactions` a secas.

/** Hacia dónde va una transferencia respecto de las cuentas filtradas en Movimientos. Sin filtro de
 *  cuenta, o con las dos puntas adentro, es `'internal'`: la plata no sale del conjunto que se está
 *  mirando, así que no suma ni resta y se muestra sin signo. Con ninguna punta adentro también es
 *  `'internal'`, pero `transfersForList` ya la dejó afuera de la lista. */
export type TransferDirection = 'out' | 'in' | 'internal'

export function transferDirection(
  transfer: Pick<AccountTransfer, 'from_account_id' | 'to_account_id'>,
  accountIds: readonly string[],
): TransferDirection {
  if (accountIds.length === 0) return 'internal'
  const fromIn = accountIds.includes(transfer.from_account_id)
  const toIn = accountIds.includes(transfer.to_account_id)
  if (fromIn === toIn) return 'internal'
  return fromIn ? 'out' : 'in'
}

/** Las cuentas de una transferencia, para la columna o línea «Cuenta» de su fila. Filtrando por una
 *  de sus puntas, sólo la otra ("desde Banco", "a Efectivo"): la filtrada ya se sabe, y con nombres
 *  largos «Banco → Efectivo» truncado dejaba ver sólo el origen. Si no, las dos. */
export function transferAccountsLabel(direction: TransferDirection, fromName: string, toName: string): string {
  if (direction === 'in') return `desde ${fromName}`
  if (direction === 'out') return `a ${toName}`
  return `${fromName} → ${toName}`
}

/** El importe con signo que aporta una transferencia a las cuentas filtradas: sale → negativo,
 *  entra → positivo, interna → 0. Es lo que se muestra en la fila y lo que suma al total del día. */
export function transferSignedCents(
  transfer: Pick<AccountTransfer, 'from_account_id' | 'to_account_id' | 'cents'>,
  accountIds: readonly string[],
): number {
  const direction = transferDirection(transfer, accountIds)
  if (direction === 'out') return -transfer.cents
  if (direction === 'in') return transfer.cents
  return 0
}

export interface TransferListFilters {
  from: string
  to: string
  type: 'all' | TransactionType
  categoryIds: readonly string[]
  /** Puede traer `UNASSIGNED_ACCOUNT_ID` (`''`): nunca coincide con una punta de una transferencia,
   *  así que filtrar sólo por «Sin cuenta» las deja a todas afuera, que es lo correcto. */
  accountIds: readonly string[]
  text?: string
  /** Fecha del movimiento más viejo que trajo la consulta, SÓLO cuando tocó `TRANSACTIONS_ROW_LIMIT`.
   *  Más atrás de eso la lista no muestra movimientos: mostrar transferencias sueltas ahí haría creer
   *  que ese tramo está completo. */
  truncatedBefore?: string
}

/** Las transferencias que entran en la lista de Movimientos con los filtros actuales. No son gasto ni
 *  ingreso ni tienen categoría: con cualquier filtro de tipo o de categoría no entra ninguna. La
 *  búsqueda mira sólo la descripción, sin distinguir mayúsculas — igual que el `ilike` con el que
 *  `useTransactions` busca movimientos. */
export function transfersForList(transfers: readonly AccountTransfer[], filters: TransferListFilters): AccountTransfer[] {
  if (filters.type !== 'all' || filters.categoryIds.length > 0) return []
  const needle = filters.text?.trim().toLowerCase()
  return transfers.filter((t) => {
    if (t.occurred_on < filters.from || t.occurred_on > filters.to) return false
    if (filters.truncatedBefore && t.occurred_on < filters.truncatedBefore) return false
    if (
      filters.accountIds.length > 0 &&
      !filters.accountIds.includes(t.from_account_id) &&
      !filters.accountIds.includes(t.to_account_id)
    ) {
      return false
    }
    if (needle && !(t.description ?? '').toLowerCase().includes(needle)) return false
    return true
  })
}

/** Una fila de la lista de Movimientos. `key` es única entre las dos tablas (un `id` solo podría
 *  repetirse entre un movimiento y una transferencia). */
export type MovementListItem =
  | { kind: 'tx'; key: string; occurredOn: string; createdAt: string; tx: Transaction }
  | { kind: 'transfer'; key: string; occurredOn: string; createdAt: string; transfer: AccountTransfer }

/** Movimientos y transferencias en una sola lista, del más nuevo al más viejo: por fecha y, dentro
 *  del mismo día, por hora de carga — el mismo orden que ya usa `useTransactions`. */
export function mergeMovementList(
  transactions: readonly Transaction[],
  transfers: readonly AccountTransfer[],
): MovementListItem[] {
  const items: MovementListItem[] = [
    ...transactions.map((tx) => ({ kind: 'tx' as const, key: `tx:${tx.id}`, occurredOn: tx.occurred_on, createdAt: tx.created_at, tx })),
    ...transfers.map((transfer) => ({
      kind: 'transfer' as const,
      key: `transfer:${transfer.id}`,
      occurredOn: transfer.occurred_on,
      createdAt: transfer.created_at,
      transfer,
    })),
  ]
  return items.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
}

/** "12 movimientos", "12 movimientos y 2 transferencias" o "2 transferencias" — las transferencias se
 *  cuentan aparte porque no son movimientos (no suman en Gastos ni en Ingresos). */
export function movementCountLabel(txCount: number, transferCount: number): string {
  const transfers = `${transferCount} transferencia${transferCount === 1 ? '' : 's'}`
  if (txCount === 0 && transferCount > 0) return transfers
  const movements = `${txCount} movimiento${txCount === 1 ? '' : 's'}`
  return transferCount > 0 ? `${movements} y ${transfers}` : movements
}

/** Label del "pico" del gráfico de barras — sólo el día ("5") cuando todas las barras caen en el
 *  mismo mes, con el mes agregado ("29 sep") cuando el rango lo cruza (ciclo semanal, bloque 5 del
 *  plan) — dos barras de meses distintos pueden compartir número de día, y sin el mes el label
 *  miente sobre cuál de las dos es. */
export function dailySpendPeakLabel(bar: DailySpendBar, sameMonth: boolean): string {
  if (sameMonth) return String(bar.day)
  return format(parseISO(bar.date), 'd MMM', { locale: es })
}
