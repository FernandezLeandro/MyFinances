import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { numeroDeCuota } from '@/features/credits/period'
import type { Receivable, ReceivablePayment } from './api'

/**
 * Función pura, separada de la red a propósito — mismo criterio que `credits/aggregate.ts` y
 * `fixed-expenses/aggregate.ts`: se verifica con números a mano sin levantar la app.
 *
 * "Cobrada" es derivado (`abonado >= total`), no una columna — ver el comentario de la migración
 * `receivables_deudas_a_favor`. Este archivo es el único lugar donde esa regla se calcula; nadie
 * más suma abonos a mano.
 *
 * Cuotas (`me_deben_cuotas_y_prestamos`): `amount` es el total, la cuota se deriva (`cuotaCents`) y
 * los abonos no se atan a una cuota — se imputan en orden contra lo esperado a cada mes. Una deuda
 * de 1 cuota se comporta igual que antes de que existieran.
 */

/** Importe de la cuota `n` (1-based): `floor(total/cuotas)`, y la última absorbe el resto para que
 *  la suma dé exacto el total. */
export function cuotaCents(totalCents: number, installments: number, n: number): number {
  const base = Math.floor(totalCents / installments)
  return n === installments ? totalCents - base * (installments - 1) : base
}

/** Suma de las primeras `k` cuotas — lo que ya tendría que haber vuelto al cerrar la cuota `k`. `k`
 *  fuera de rango se acota a `[0, installments]`. */
export function esperadoHasta(totalCents: number, installments: number, k: number): number {
  if (k <= 0) return 0
  if (k >= installments) return totalCents
  return Math.floor(totalCents / installments) * k
}

export interface ReceivableSummary {
  receivable: Receivable
  /** Abonos de esta deuda, más reciente primero. */
  payments: ReceivablePayment[]
  paidCents: number
  /** `max(total - abonado, 0)`. Lo que todavía te deben, en todas las cuotas. */
  pendingCents: number
  /** Se cobró entera. Exige `amountCents > 0` además de `paidCents >= amountCents`: sin esa
   *  guarda, una fila fantasma de $0 (las que dejaba un alta inline vieja)
   *  aparecería como cobrada sin que nadie la haya pagado. */
  cobrada: boolean
  /** Cuotas de meses anteriores que todavía no volvieron. Las deudas sin mes esperado nunca vencen —
   *  "me deben, no sé cuándo" es un estado válido, no un atraso. */
  vencidoCents: number
  vencida: boolean
  /** Lo que falta de la cuota de este mes (0 si se adelantó o si no cae ninguna). */
  esteMesCents: number
  /** `vencido + esteMes`: lo que se espera cobrar en el mes. */
  aCobrarCents: number
  /** Número de la cuota que cae este mes (1…`installments`), o `null` si no cae ninguna. */
  cuotaDelMes: number | null
  /** Cuotas ya cubiertas enteras por los abonos (0…`installments`). */
  cuotasCobradas: number
  /** Mes (`'yyyy-MM-dd'`, día 1) de la primera cuota impaga POSTERIOR a este mes. */
  proximoPeriodo: string | null
  /** Importe con el que arranca "Cobrar": lo de este mes, o si no hay, lo que falta de la próxima
   *  cuota (o todo, sin fecha). */
  proximoCobroCents: number
  /** Abonos con fecha en el mes de `today`. */
  cobradoEsteMesCents: number
}

function summarizeOne(receivable: Receivable, payments: ReceivablePayment[], today: Date): ReceivableSummary {
  const own = payments
    .filter((p) => p.receivable_id === receivable.id)
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0))
  const total = receivable.amountCents
  const n = receivable.installments
  const paidCents = own.reduce((sum, p) => sum + p.amountCents, 0)
  const pendingCents = Math.max(total - paidCents, 0)
  const cobrada = total > 0 && paidCents >= total

  let cuotasCobradas = 0
  while (cuotasCobradas < n && total > 0 && esperadoHasta(total, n, cuotasCobradas + 1) <= paidCents) cuotasCobradas++

  const thisPeriod = format(startOfMonth(today), 'yyyy-MM-dd')
  const first = receivable.expected_period
  let vencidoCents = 0
  let esteMesCents = 0
  let cuotaDelMes: number | null = null
  let proximoPeriodo: string | null = null
  let proximaCuotaFaltante = pendingCents

  if (first != null && !cobrada) {
    const k = numeroDeCuota(first, thisPeriod)
    vencidoCents = Math.max(esperadoHasta(total, n, k - 1) - paidCents, 0)
    esteMesCents = Math.max(esperadoHasta(total, n, k) - paidCents, 0) - vencidoCents
    cuotaDelMes = k >= 1 && k <= n ? k : null
    for (let j = Math.max(k + 1, 1); j <= n; j++) {
      const faltante = esperadoHasta(total, n, j) - paidCents
      if (faltante > 0) {
        proximoPeriodo = format(addMonths(startOfMonth(parseISO(first)), j - 1), 'yyyy-MM-dd')
        proximaCuotaFaltante = Math.min(faltante, cuotaCents(total, n, j))
        break
      }
    }
  }

  const aCobrarCents = vencidoCents + esteMesCents
  const monthPrefix = thisPeriod.slice(0, 7)

  return {
    receivable,
    payments: own,
    paidCents,
    pendingCents,
    cobrada,
    vencidoCents,
    vencida: vencidoCents > 0,
    esteMesCents,
    aCobrarCents,
    cuotaDelMes,
    cuotasCobradas,
    proximoPeriodo,
    proximoCobroCents: aCobrarCents > 0 ? aCobrarCents : proximaCuotaFaltante,
    cobradoEsteMesCents: own.filter((p) => p.occurred_on.startsWith(monthPrefix)).reduce((sum, p) => sum + p.amountCents, 0),
  }
}

/** Cuánto falta cobrar de la cuota `k`, con los abonos imputados en orden. */
function faltaDeCuota(total: number, n: number, k: number, paid: number): number {
  return Math.min(Math.max(esperadoHasta(total, n, k) - paid, 0), cuotaCents(total, n, k))
}

/** La cuota que una deuda tiene en un mes dado, y cuánto falta de ella HOY. */
export interface CuotaDelMes {
  summary: ReceivableSummary
  /** Número de cuota (1-based). */
  cuota: number
  cuotaCents: number
  /** 0 = cubierta (por un abono de ese mes, de antes o adelantado — los abonos se imputan en orden). */
  faltaCents: number
}

/** Las cuotas que caen en `period` (`'yyyy-MM-dd'`, día 1) — para navegar Me Deben a cualquier mes,
 *  pasado o futuro. Incluye deudas ya cobradas enteras (en un mes pasado, su cuota figura cubierta).
 *  Las sin fecha no caen en ningún mes. Las que faltan primero. */
export function cuotasDelMes(statuses: ReceivableSummary[], period: string): CuotaDelMes[] {
  const items: CuotaDelMes[] = []
  for (const s of statuses) {
    const { receivable: r } = s
    if (!r.expected_period || r.amountCents <= 0) continue
    const k = numeroDeCuota(r.expected_period, period)
    if (k < 1 || k > r.installments) continue
    items.push({
      summary: s,
      cuota: k,
      cuotaCents: cuotaCents(r.amountCents, r.installments, k),
      faltaCents: faltaDeCuota(r.amountCents, r.installments, k, s.paidCents),
    })
  }
  return items.sort((a, b) => Number(b.faltaCents > 0) - Number(a.faltaCents > 0))
}

/** Lo que entró en `period` por cada deuda (abonos con fecha en ese mes), el más reciente primero. */
export function cobradoEnMes(statuses: ReceivableSummary[], period: string): { summary: ReceivableSummary; cents: number }[] {
  const prefix = period.slice(0, 7)
  return statuses
    .map((s) => ({ summary: s, own: s.payments.filter((p) => p.occurred_on.startsWith(prefix)) }))
    .filter(({ own }) => own.length > 0)
    .sort((a, b) => b.own[0].occurred_on.localeCompare(a.own[0].occurred_on))
    .map(({ summary, own }) => ({ summary, cents: own.reduce((sum, p) => sum + p.amountCents, 0) }))
}

export interface ReceivablesSummary {
  /** Todas, cobradas incluidas — para buscar por id y para navegar a otros meses. */
  todas: ReceivableSummary[]
  /** Con algo para cobrar este mes (vencido o cuota del mes) — vencidas primero. */
  esteMes: ReceivableSummary[]
  /** No cobradas y sin mes esperado: no caen en ningún mes, se listan aparte. */
  sinFecha: ReceivableSummary[]
  aCobrarCents: number
  vencidoCents: number
  cobradoEsteMesCents: number
  /** Todo lo que te deben, este mes y los que vienen. */
  totalPendingCents: number
}

const sumBy = (items: ReceivableSummary[], key: (s: ReceivableSummary) => number) => items.reduce((acc, s) => acc + key(s), 0)

/** `today` entra por parámetro, nunca `new Date()` adentro — mismo criterio que
 *  `summarizeFixedExpenses`: así se puede testear sin depender del reloj. */
export function summarizeReceivables(
  receivables: Receivable[],
  payments: ReceivablePayment[],
  today: Date,
): ReceivablesSummary {
  const statuses = receivables.map((r) => summarizeOne(r, payments, today))
  const pendientes = statuses.filter((s) => !s.cobrada)

  return {
    todas: statuses,
    esteMes: pendientes
      .filter((s) => s.aCobrarCents > 0)
      .sort((a, b) => Number(b.vencida) - Number(a.vencida) || (a.receivable.expected_period ?? '').localeCompare(b.receivable.expected_period ?? '')),
    sinFecha: pendientes.filter((s) => s.receivable.expected_period == null && s.pendingCents > 0),
    aCobrarCents: sumBy(statuses, (s) => s.aCobrarCents),
    vencidoCents: sumBy(statuses, (s) => s.vencidoCents),
    cobradoEsteMesCents: sumBy(statuses, (s) => s.cobradoEsteMesCents),
    totalPendingCents: sumBy(statuses, (s) => s.pendingCents),
  }
}
