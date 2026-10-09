/**
 * Períodos de Inversiones — lógica pura. Es calendario (semana lunes-domingo, mes, año), no el ciclo
 * de caja de `src/lib/cycle.ts`: invertir no está atado al sueldo. Mismo criterio de semana que el
 * preset «Esta semana» de Movimientos (`movementPeriod.ts`).
 */
import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  min as minDate,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import { es } from 'date-fns/locale'

export type Granularity = 'all' | 'year' | 'month' | 'week'

export const GRANULARITIES: readonly Granularity[] = ['all', 'year', 'month', 'week']

export const GRANULARITY_LABELS: Record<Granularity, string> = { all: 'Todo', year: 'Año', month: 'Mes', week: 'Semana' }

export interface DateRange {
  /** 'yyyy-MM-dd', inclusive. */
  from: string
  to: string
}

const WEEK = { weekStartsOn: 1 } as const
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** El rango que contiene a `anchor`; `null` en «Todo» (sin límite). */
export function rangeFor(g: Granularity, anchor: Date): DateRange | null {
  switch (g) {
    case 'all':
      return null
    case 'year':
      return { from: iso(startOfYear(anchor)), to: iso(endOfYear(anchor)) }
    case 'month':
      return { from: iso(startOfMonth(anchor)), to: iso(endOfMonth(anchor)) }
    case 'week':
      return { from: iso(startOfWeek(anchor, WEEK)), to: iso(endOfWeek(anchor, WEEK)) }
  }
}

/** Mueve el ancla un período para atrás (`-1`) o adelante (`1`). En «Todo» no hay nada que mover. */
export function shiftAnchor(g: Granularity, anchor: Date, dir: -1 | 1): Date {
  switch (g) {
    case 'all':
      return anchor
    case 'year':
      return addYears(anchor, dir)
    case 'month':
      return addMonths(anchor, dir)
    case 'week':
      return addDays(anchor, 7 * dir)
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Octubre 2026», «2026», «5 – 11 oct 2026», «Todo el historial». */
export function rangeLabel(g: Granularity, anchor: Date): string {
  const range = rangeFor(g, anchor)
  if (!range) return 'Todo el historial'
  const from = parseISO(range.from)
  const to = parseISO(range.to)
  switch (g) {
    case 'year':
      return format(from, 'yyyy')
    case 'month':
      return cap(format(from, 'MMMM yyyy', { locale: es }))
    case 'week':
      return from.getMonth() === to.getMonth()
        ? `${format(from, 'd')} – ${format(to, "d MMM yyyy", { locale: es })}`
        : `${format(from, 'd MMM', { locale: es })} – ${format(to, 'd MMM yyyy', { locale: es })}`
    default:
      return ''
  }
}

/** ¿`date` ('yyyy-MM-dd') cae en el rango? Sin rango (Todo) entra todo. */
export function inRange(date: string, range: DateRange | null): boolean {
  return !range || (date >= range.from && date <= range.to)
}

export interface Slot extends DateRange {
  label: string
}

/**
 * Las barras del gráfico «Invertido por …»: semana → días, mes → semanas (la primera y la última
 * pueden quedar cortas, se recortan al mes), año → meses, todo → años desde la primera inversión
 * (`earliest`) hasta el año en curso.
 */
export function slotsFor(g: Granularity, anchor: Date, earliest: string | null, today: Date = new Date()): Slot[] {
  const range = rangeFor(g, anchor)
  const slots: Slot[] = []

  if (g === 'week' && range) {
    let day = parseISO(range.from)
    for (let i = 0; i < 7; i++) {
      slots.push({ from: iso(day), to: iso(day), label: cap(format(day, 'EEE d', { locale: es }).replace('.', '')) })
      day = addDays(day, 1)
    }
  } else if (g === 'month' && range) {
    const monthEnd = parseISO(range.to)
    let start = parseISO(range.from)
    while (start <= monthEnd) {
      const end = minDate([endOfWeek(start, WEEK), monthEnd])
      slots.push({
        from: iso(start),
        to: iso(end),
        label: start.getDate() === end.getDate() ? format(start, 'd') : `${format(start, 'd')}–${format(end, 'd')}`,
      })
      start = addDays(end, 1)
    }
  } else if (g === 'year' && range) {
    for (let m = 0; m < 12; m++) {
      const monthStart = addMonths(parseISO(range.from), m)
      slots.push({ from: iso(monthStart), to: iso(endOfMonth(monthStart)), label: cap(format(monthStart, 'MMM', { locale: es }).replace('.', '')) })
    }
  } else if (g === 'all') {
    const lastYear = today.getFullYear()
    const firstYear = earliest ? Math.min(parseISO(earliest).getFullYear(), lastYear) : lastYear
    for (let y = firstYear; y <= lastYear; y++) {
      slots.push({ from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) })
    }
  }

  return slots
}
