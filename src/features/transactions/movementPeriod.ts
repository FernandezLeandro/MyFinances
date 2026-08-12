import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns'
import { es } from 'date-fns/locale'

export type MovementPeriodPreset = 'today' | 'yesterday' | 'week' | '15d' | 'month' | 'year' | 'custom'

export interface MovementPeriod {
  preset: MovementPeriodPreset
  /** Sólo con preset 'month': un día cualquiera del mes elegido. Lo mueven las flechas del header. */
  anchor: string
  /** Sólo con preset 'custom'. */
  from: string
  to: string
}

const PRESETS: MovementPeriodPreset[] = ['today', 'yesterday', 'week', '15d', 'month', 'year', 'custom']

export const MOVEMENT_PERIOD_PRESETS = PRESETS

export const MOVEMENT_PERIOD_PRESET_LABELS: Record<MovementPeriodPreset, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Esta semana',
  '15d': 'Últimos 15 días',
  month: 'Este mes',
  year: 'Este año',
  custom: 'Personalizado',
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Rango [from, to] en 'yyyy-MM-dd', calendario (no ventanas móviles): "esta semana" es
 * lunes-domingo, "este mes"/"este año" van del primero al último día — coincide con cómo el
 * resto de la app cierra períodos (resumen mensual, tarjetas). 'month' se ancla a `p.anchor`
 * porque las flechas del header navegan mes a mes sin salir del preset.
 */
export function periodRange(p: MovementPeriod): { from: string; to: string } {
  const now = new Date()
  switch (p.preset) {
    case 'today':
      return { from: iso(now), to: iso(now) }
    case 'yesterday': {
      const d = subDays(now, 1)
      return { from: iso(d), to: iso(d) }
    }
    case 'week':
      return { from: iso(startOfWeek(now, { weekStartsOn: 1 })), to: iso(endOfWeek(now, { weekStartsOn: 1 })) }
    case '15d':
      return { from: iso(subDays(now, 14)), to: iso(now) }
    case 'month': {
      const anchor = parseISO(p.anchor)
      return { from: iso(startOfMonth(anchor)), to: iso(endOfMonth(anchor)) }
    }
    case 'year':
      return { from: iso(startOfYear(now)), to: iso(endOfYear(now)) }
    case 'custom':
      return { from: p.from, to: p.to }
  }
}

/** Texto para el header cuando el preset no es 'month' (que ya tiene su propio navegador de mes). */
export function periodLabel(p: MovementPeriod): string {
  const { from, to } = periodRange(p)
  if (p.preset === 'today' || p.preset === 'yesterday') {
    return format(parseISO(from), "EEEE d 'de' MMMM", { locale: es })
  }
  const fromLabel = format(parseISO(from), 'd MMM', { locale: es })
  const toLabel = format(parseISO(to), 'd MMM', { locale: es })
  return `${fromLabel} – ${toLabel}`
}

export function defaultMovementPeriod(): MovementPeriod {
  return { preset: 'month', anchor: iso(new Date()), from: '', to: '' }
}
