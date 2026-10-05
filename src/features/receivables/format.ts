import { format, getYear, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatMoney } from '@/lib/money'
import type { ReceivableSummary } from './aggregate'

/** Mes corto para una línea de estado: «noviembre» dentro del año en curso, «nov 2027» fuera. */
function mes(period: string, today: Date): string {
  const date = parseISO(period)
  return getYear(date) === getYear(today) ? format(date, 'MMMM', { locale: es }) : format(date, 'MMM yyyy', { locale: es })
}

/** Línea de estado de una deuda — la misma en la fila de la lista y en su panel. `vencido` pinta en
 *  negativo. */
export function estadoDeCobro(s: ReceivableSummary, today: Date): { text: string; vencido: boolean } {
  const n = s.receivable.installments
  const cuota = s.cuotaDelMes != null && n > 1 ? `Cuota ${s.cuotaDelMes}/${n}` : null
  if (s.cobrada) return { text: 'Cobrada', vencido: false }
  if (s.vencidoCents > 0) {
    const text =
      n === 1 && s.receivable.expected_period
        ? `Venció en ${mes(s.receivable.expected_period, today)}`
        : [cuota, `${formatMoney(s.vencidoCents)} vencido`].filter(Boolean).join(' · ')
    return { text, vencido: true }
  }
  if (s.esteMesCents > 0) {
    if (cuota) return { text: cuota, vencido: false }
    return { text: s.paidCents > 0 ? `Te devolvió ${formatMoney(s.paidCents)}` : 'Sin abonos', vencido: false }
  }
  if (s.proximoPeriodo) {
    const cuando = mes(s.proximoPeriodo, today)
    return { text: n === 1 ? `Para ${cuando}` : `Próxima cuota: ${cuando}`, vencido: false }
  }
  return { text: 'Sin fecha', vencido: false }
}
