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
import { cycleContaining, DEFAULT_CYCLE_CONFIG, type CycleConfig } from '@/lib/cycle'

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
 *
 * `config` sólo importa para 'month': en vez de "el mes calendario que contiene a `anchor`" a
 * secas, es "el ciclo configurado por el usuario (`src/lib/cycle.ts`) que contiene a `anchor`" —
 * con `config.kind === 'monthly'` (el default, y el default de este parámetro si no se pasa) es
 * exactamente lo mismo que antes, sin ningún cambio; con quincenal/semanal, el preset "Este mes"
 * pasa a mostrar la quincena o semana en curso. El preset se sigue llamando `'month'` (no se le
 * cambia el id ni el copy: ver Movimientos.tsx para el porqué de no tocar el resto de la interfaz
 * todavía) — sólo cambia qué ventana representa. Opcional (no todo caller conoce el ciclo real del
 * usuario ni le importa: `periodLabel` nunca se llama para el preset 'month', por ejemplo).
 */
export function periodRange(p: MovementPeriod, config: CycleConfig = DEFAULT_CYCLE_CONFIG): { from: string; to: string } {
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
      const cycle = cycleContaining(config, parseISO(p.anchor))
      return { from: cycle.from, to: cycle.to }
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

/** Traduce un rango de Análisis (`Period.from/to`) al modelo de Movimientos, para el drill-down por
 *  categoría: si el rango es exactamente un mes calendario, un 'month' anclado ahí — así las
 *  flechas del header de Movimientos siguen funcionando; si no (3m/6m/12m/custom), un 'custom' con
 *  el rango tal cual. */
export function movementPeriodFromRange(from: string, to: string): MovementPeriod {
  const fromDate = parseISO(from)
  const isCalendarMonth = iso(startOfMonth(fromDate)) === from && iso(endOfMonth(fromDate)) === to
  if (isCalendarMonth) return { preset: 'month', anchor: from, from: '', to: '' }
  return { preset: 'custom', anchor: from, from, to }
}
