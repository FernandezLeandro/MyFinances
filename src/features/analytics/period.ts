import { addMonths, differenceInCalendarDays, endOfMonth, format, isValid, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  cycleContaining,
  DEFAULT_CYCLE_CONFIG,
  previousCycleRange as previousCycleRangeOf,
  shiftCycle,
  type CycleConfig,
} from '@/lib/cycle'

export type PeriodPreset = 'month' | '3m' | 'custom'

export interface Period {
  preset: PeriodPreset
  /** yyyy-MM-dd, un día cualquiera del ciclo/mes elegido — lo mueven las flechas del header, igual
   *  que `MovementPeriod.anchor` en Movimientos. Sólo importa para los presets no-`custom`: define
   *  de qué ciclo/ventana salen `from`/`to`. */
  anchor: string
  from: string
  to: string
}

/** Meses hacia atrás desde `anchor` para el preset '3m' — siempre calendario, sin importar el ciclo
 *  configurado: es una ventana de tendencia, no "mi ciclo de caja" (ver `presetToRange`). */
const MONTHS_BACK_3M = 2

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** `preset === 'month'` representa el CICLO configurado por el usuario (mensual/quincenal/semanal,
 *  `useCycleConfig()`) que contiene a `anchor` — no el mes calendario a secas. Mismo patrón que ya
 *  usa `periodRange` en `features/transactions/movementPeriod.ts` (Bloque 3): con `config.kind ===
 *  'monthly'` (el default) es exactamente lo mismo que antes, cero cambio visible. El id/copy del
 *  preset ("Este mes") no se toca — sólo la ventana que representa.
 *
 *  El preset '3m' se queda 100% calendario a propósito: es una ventana de tendencia más larga, no
 *  la unidad de ciclo del usuario. */
export function presetToRange(
  preset: Exclude<PeriodPreset, 'custom'>,
  anchor: string,
  config: CycleConfig = DEFAULT_CYCLE_CONFIG,
): { from: string; to: string } {
  const anchorDate = parseISO(anchor)
  if (preset === 'month') {
    const cycle = cycleContaining(config, anchorDate)
    return { from: cycle.from, to: cycle.to }
  }
  return {
    from: iso(startOfMonth(subMonths(anchorDate, MONTHS_BACK_3M))),
    to: iso(endOfMonth(anchorDate)),
  }
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  month: 'Este mes',
  '3m': 'Últimos 3 meses',
  custom: 'Personalizado',
}

/** Mismos presets que `PERIOD_PRESET_LABELS`, con el texto de venta corto para que entren en una
 *  fila en mobile. */
export const PERIOD_PRESET_MOBILE_LABELS: Record<PeriodPreset, string> = {
  month: 'Mes',
  '3m': '3m',
  custom: 'Otro',
}

export function defaultPeriod(config: CycleConfig = DEFAULT_CYCLE_CONFIG): Period {
  const anchor = iso(new Date())
  return { preset: 'month', anchor, ...presetToRange('month', anchor, config) }
}

/** Sólo tiene sentido llamarla con `period.preset !== 'custom'` — mueve el ancla y recalcula
 *  `from`/`to` con el mismo preset. Un `custom` no tiene ancla de navegación: sus flechas ni se
 *  muestran (ver `Analisis.tsx`). Con `preset === 'month'` mueve un CICLO, no necesariamente un mes
 *  calendario (`shiftCycle`, mismo criterio que `shiftMonth` en `useMovimientosFilters.ts`) — con
 *  `config.kind === 'monthly'` (default) es exactamente `addMonths`/`subMonths` de antes. */
export function shiftPeriodMonth(period: Period, delta: number, config: CycleConfig = DEFAULT_CYCLE_CONFIG): Period {
  if (period.preset === 'custom') {
    const anchor = iso(delta > 0 ? addMonths(parseISO(period.anchor), delta) : subMonths(parseISO(period.anchor), -delta))
    return { ...period, anchor }
  }
  if (period.preset === 'month') {
    const next = shiftCycle(config, cycleContaining(config, parseISO(period.anchor)), delta)
    return { ...period, anchor: next.from, from: next.from, to: next.to }
  }
  const anchor = iso(delta > 0 ? addMonths(parseISO(period.anchor), delta) : subMonths(parseISO(period.anchor), -delta))
  return { ...period, anchor, ...presetToRange(period.preset, anchor, config) }
}

/** Texto para el header cuando el preset no es 'month' (que ya tiene su propio navegador de ciclo) —
 *  mismo criterio que `periodLabel` en `features/transactions/movementPeriod.ts`. Recibe el rango ya
 *  resuelto (no un `Period` completo) porque, con `preset === 'month'`, `period.from`/`.to` pueden
 *  haber quedado desactualizados frente al ciclo configurado — ver `range` en `Analisis.tsx`. */
export function periodRangeLabel(range: { from: string; to: string }): string {
  const from = parseISO(range.from)
  const to = parseISO(range.to)
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
  // AN-03 del QA de Análisis: con "Personalizado" y una de las dos fechas borrada, `period.from`/
  // `.to` podían llegar acá vacíos — `parseISO('')` da una fecha inválida, y `format()` sobre eso
  // tira `RangeError: Invalid time value` sin capturar, que se llevaba puesta la pantalla entera.
  // Se devuelve el rango de entrada tal cual: no hay "anterior" que calcular sin un rango válido, y
  // el llamador (`Analisis.tsx`) ya no rompe render con eso.
  if (!isValid(parseISO(from)) || !isValid(parseISO(to))) return { from, to }
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  return {
    to: iso(subDays(parseISO(from), 1)),
    from: iso(subDays(parseISO(from), days)),
  }
}

/** El período de comparación para el hero y el top de categorías (ver `Analisis.tsx`). Con
 *  `preset === 'month'` es el CICLO real anterior (`previousCycleRange` de `src/lib/cycle.ts`) —
 *  que puede tener una cantidad de días distinta a la del ciclo actual (una quincena de 15 días
 *  contra una de 13–16, ver `firstHalfEnd`) — por eso las comparaciones nunca se hacen por total
 *  crudo, siempre por promedio diario. Para '3m'/'custom' sigue siendo `previousRange` (mismo
 *  largo en días por construcción, así que promedio y total dan el mismo cambio porcentual — cero
 *  regresión). `range` es el rango YA RESUELTO de `period` (ver el comentario de
 *  `periodRangeLabel` sobre por qué no se usa `period.from`/`.to` directo). */
export function comparisonRange(
  period: Pick<Period, 'preset' | 'anchor'>,
  range: { from: string; to: string },
  config: CycleConfig = DEFAULT_CYCLE_CONFIG,
): { from: string; to: string } {
  if (period.preset === 'month') {
    return previousCycleRangeOf(config, cycleContaining(config, parseISO(period.anchor)))
  }
  return previousRange(range.from, range.to)
}
