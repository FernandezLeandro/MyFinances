import { parseISO, startOfMonth } from 'date-fns'
import type { Receivable, ReceivablePayment } from './api'

/**
 * Función pura, separada de la red a propósito — mismo criterio que `credits/aggregate.ts` y
 * `fixed-expenses/aggregate.ts`: se verifica con números a mano sin levantar la app.
 *
 * "Cobrada" es derivado (`abonado >= total`), no una columna — ver el comentario de la migración
 * `receivables_deudas_a_favor`. Este archivo es el único lugar donde esa regla se calcula; nadie
 * más suma abonos a mano.
 */

export interface ReceivableSummary {
  receivable: Receivable
  /** Abonos de esta deuda, más reciente primero. */
  payments: ReceivablePayment[]
  paidCents: number
  /** `max(total - abonado, 0)`. Lo que todavía te deben. */
  pendingCents: number
  /** Te pagaron de más (intereses, redondeo). 0 en el caso normal. */
  overpaidCents: number
  /** Se cobró entera. Exige `amountCents > 0` además de `paidCents >= amountCents`: sin esa
   *  guarda, una fila fantasma de $0 (las que dejaba un alta inline vieja)
   *  aparecería como cobrada sin que nadie la haya pagado. */
  cobrada: boolean
  /** Pasó el mes en que esperabas cobrarla y todavía debe. Las que no tienen mes esperado nunca
   *  vencen — "me deben, no sé cuándo" es un estado válido, no un atraso. */
  vencida: boolean
  /** Sigue contando como plata tuya en el saldo: `!already_expensed && !cobrada`. Prestar plata no
   *  genera un movimiento, así que esa plata no salió del saldo hasta que se "descuenta". La regla
   *  del flag vive acá, en un solo lugar. */
  cuentaEnSaldo: boolean
}

function summarizeOne(receivable: Receivable, payments: ReceivablePayment[], today: Date): ReceivableSummary {
  const own = payments
    .filter((p) => p.receivable_id === receivable.id)
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0))
  const paidCents = own.reduce((sum, p) => sum + p.amountCents, 0)
  const pendingCents = Math.max(receivable.amountCents - paidCents, 0)
  const overpaidCents = Math.max(paidCents - receivable.amountCents, 0)
  const cobrada = receivable.amountCents > 0 && paidCents >= receivable.amountCents

  const vencida =
    !cobrada &&
    receivable.expected_period != null &&
    startOfMonth(parseISO(receivable.expected_period)) < startOfMonth(today)

  return {
    receivable,
    payments: own,
    paidCents,
    pendingCents,
    overpaidCents,
    cobrada,
    vencida,
    cuentaEnSaldo: !receivable.already_expensed && !cobrada,
  }
}

export interface ReceivablesSummary {
  /** No cobradas, ordenadas por mes esperado ascendente; las sin mes van al final (una deuda con
   *  fecha es más accionable que una sin fecha, aunque sea más vieja). */
  pendientes: ReceivableSummary[]
  cobradas: ReceivableSummary[]
  /** Todo lo que te deben, sin importar el flag — el número grande de /me-deben. */
  totalPendingCents: number
  /** Sólo `!already_expensed`: lo que todavía cuenta dentro del saldo. */
  contadoEnSaldoCents: number
  /** Sólo `already_expensed`: plata que va a volver pero que NO cuenta en el saldo porque ya salió
   *  como gasto. Se muestra aparte para que el usuario entienda por qué el total no coincide. */
  yaGastadoPendingCents: number
  vencidasCount: number
  /** Suma de `amountCents` de TODO (pendientes + cobradas) — cuánto se prestó en total alguna vez,
   *  no sólo lo que sigue abierto. Junto con `totalReturnedCents` arma la barra "ya te devolvieron
   *  X de Y prestados" del hero de Me Deben. */
  totalLentCents: number
  /** Suma de `paidCents` de TODO (pendientes + cobradas) — lo que ya volvió, incluidas las deudas
   *  ya cerradas del todo. */
  totalReturnedCents: number
}

/** Clave de orden para mes esperado: `null` ("no sé cuándo") ordena después de cualquier mes real. */
function periodSortKey(period: string | null): string {
  return period ?? '9999-99'
}

/** `today` entra por parámetro, nunca `new Date()` adentro — mismo criterio que
 *  `summarizeFixedExpenses`: así se puede testear sin depender del reloj. */
export function summarizeReceivables(
  receivables: Receivable[],
  payments: ReceivablePayment[],
  today: Date,
): ReceivablesSummary {
  const statuses = receivables.map((r) => summarizeOne(r, payments, today))

  const pendientes = statuses
    .filter((s) => !s.cobrada)
    .sort((a, b) => periodSortKey(a.receivable.expected_period).localeCompare(periodSortKey(b.receivable.expected_period)))
  const cobradas = statuses.filter((s) => s.cobrada)

  return {
    pendientes,
    cobradas,
    totalPendingCents: statuses.reduce((sum, s) => sum + s.pendingCents, 0),
    contadoEnSaldoCents: statuses.filter((s) => s.cuentaEnSaldo).reduce((sum, s) => sum + s.pendingCents, 0),
    yaGastadoPendingCents: statuses
      .filter((s) => s.receivable.already_expensed && !s.cobrada)
      .reduce((sum, s) => sum + s.pendingCents, 0),
    vencidasCount: statuses.filter((s) => s.vencida).length,
    totalLentCents: statuses.reduce((sum, s) => sum + s.receivable.amountCents, 0),
    totalReturnedCents: statuses.reduce((sum, s) => sum + s.paidCents, 0),
  }
}

export interface MesGroup {
  /** `'yyyy-MM-dd'` día 1, o `null` para el grupo "Sin fecha". */
  period: string | null
  items: ReceivableSummary[]
  totalPendingCents: number
}

/** Agrupa las pendientes por mes esperado preservando el orden de entrada (ya viene ordenado por
 *  `summarizeReceivables`) — mismo patrón que `groupByPeriod` en `FixedExpenseDetailDialog`. */
export function agruparPorMesEsperado(items: ReceivableSummary[]): MesGroup[] {
  const groups: MesGroup[] = []
  const byPeriod = new Map<string | null, MesGroup>()
  for (const item of items) {
    const period = item.receivable.expected_period
    let group = byPeriod.get(period)
    if (!group) {
      group = { period, items: [], totalPendingCents: 0 }
      byPeriod.set(period, group)
      groups.push(group)
    }
    group.items.push(item)
    group.totalPendingCents += item.pendingCents
  }
  return groups
}
