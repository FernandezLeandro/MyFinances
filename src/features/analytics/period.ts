import { addMonths, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'

export type PeriodPreset = 'month' | '3m' | '6m' | '12m' | 'custom'

export interface Period {
  preset: PeriodPreset
  /** yyyy-MM-dd, un día cualquiera del mes elegido — lo mueven las flechas del header, igual que
   *  `MovementPeriod.anchor` en Movimientos. Sólo importa para los presets no-`custom`: define de
   *  qué mes salen `from`/`to`. */
  anchor: string
  from: string
  to: string
}

const MONTHS_BACK: Record<Exclude<PeriodPreset, 'custom'>, number> = {
  month: 0,
  '3m': 2,
  '6m': 5,
  '12m': 11,
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** `to` es fin del mes de `anchor` (no "hoy"), así que navegar a un mes pasado con las flechas
 *  también recorta los presets multi-mes a ese mes — no siguen enganchados al mes en curso. */
export function presetToRange(preset: Exclude<PeriodPreset, 'custom'>, anchor: string): { from: string; to: string } {
  const anchorDate = parseISO(anchor)
  return {
    from: iso(startOfMonth(subMonths(anchorDate, MONTHS_BACK[preset]))),
    to: iso(endOfMonth(anchorDate)),
  }
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  month: 'Este mes',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '12m': 'Últimos 12 meses',
  custom: 'Personalizado',
}

export function defaultPeriod(): Period {
  const anchor = iso(new Date())
  return { preset: 'month', anchor, ...presetToRange('month', anchor) }
}

/** Sólo tiene sentido llamarla con `period.preset !== 'custom'` — mueve el mes ancla y recalcula
 *  `from`/`to` con el mismo preset. Un `custom` no tiene mes ancla: sus flechas ni se muestran (ver
 *  `Analisis.tsx`). */
export function shiftPeriodMonth(period: Period, delta: number): Period {
  const anchor = iso(delta > 0 ? addMonths(parseISO(period.anchor), delta) : subMonths(parseISO(period.anchor), -delta))
  if (period.preset === 'custom') return { ...period, anchor }
  return { ...period, anchor, ...presetToRange(period.preset, anchor) }
}

/** Texto para el header cuando el preset no es 'month' (que ya tiene su propio navegador de mes) —
 *  mismo criterio que `periodLabel` en `features/transactions/movementPeriod.ts`. */
export function periodRangeLabel(period: Period): string {
  const from = parseISO(period.from)
  const to = parseISO(period.to)
  const fromLabel = format(from, 'MMM yyyy', { locale: es })
  const toLabel = format(to, 'MMM yyyy', { locale: es })
  if (fromLabel === toLabel) return fromLabel
  const sameYear = from.getFullYear() === to.getFullYear()
  return `${format(from, sameYear ? 'MMM' : 'MMM yyyy', { locale: es })} – ${toLabel}`
}

/** El período inmediatamente anterior a `[from, to]`, de igual duración en días — "últimos 30 días"
 *  contra los 30 anteriores a esos, no contra el mes calendario anterior. Compartido por
 *  `useTopCategoriesComparison` y el total del hero de Análisis, para que las dos comparativas
 *  midan exactamente lo mismo. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  return {
    to: iso(subDays(parseISO(from), 1)),
    from: iso(subDays(parseISO(from), days)),
  }
}

/** Ventana fija de 12 meses terminando en el mes de `anchor` — la usan los gráficos de evolución
 *  mensual y tendencia de saldo, independiente del preset elegido para el donut (ver
 *  `Analisis.tsx`): con un solo mes de datos esos gráficos no dicen nada. */
export function seriesRange(anchor: string): { from: string; to: string } {
  const anchorDate = parseISO(anchor)
  return {
    from: iso(startOfMonth(subMonths(anchorDate, 11))),
    to: iso(endOfMonth(anchorDate)),
  }
}
