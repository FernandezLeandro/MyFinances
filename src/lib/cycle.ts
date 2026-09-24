import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDate,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Módulo central de "ciclo de caja" — la ventana con la que el usuario mira su plata (mensual,
 * quincenal, semanal). Deliberadamente NO toca la periodicidad real de una obligación (una cuota de
 * tarjeta sigue siendo mensual, la aritmética vive en `features/credits/period.ts` y no se mueve de
 * ahí): ese es otro eje, decidido por el mundo real, no por el usuario.
 *
 * Todo pasa por `parseISO`/strings `'yyyy-MM-dd'`, nunca `new Date(string)` — mismo motivo que ya
 * documentan `features/fixed-expenses/period.ts` y `features/credits/period.ts`: en Argentina
 * (UTC−3) un `new Date('2026-09-01')` parsea a medianoche UTC, que cae el día anterior en hora
 * local.
 */

export type CycleKind = 'monthly' | 'biweekly' | 'weekly'

export interface CycleConfig {
  kind: CycleKind
  /** Sólo aplica a 'weekly'. 1 = lunes … 7 = domingo (ISO), como `startOfWeek(d, {weekStartsOn})`
   *  de date-fns. */
  weekStartsOn: number
}

/** Mensual, mes calendario — el comportamiento de la app hoy. Default de todo usuario que no
 *  configuró nada: con este `kind`, todas las funciones de este módulo devuelven exactamente lo
 *  mismo que ya calculaba cada pantalla con `startOfMonth`/`endOfMonth` — cero cambio visible. */
export const DEFAULT_CYCLE_CONFIG: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }

/** Identificador estable y ordenable de un ciclo: su fecha de inicio, `'yyyy-MM-dd'`. Con
 *  `kind: 'monthly'` es exactamente el `period` mensual (día 1) que ya usan las tablas y RPCs
 *  existentes — por eso sirve tal cual de queryKey y de argumento a los RPC viejos, sin traducir. */
export type CycleId = string

export interface Cycle {
  id: CycleId
  kind: CycleKind
  /** Inclusive. */
  from: string
  /** Inclusive. */
  to: string
  /** Meses que este ciclo toca, día 1 cada uno, ascendente. Siempre un elemento salvo 'weekly' a
   *  caballo de dos meses (ver nota en `cyclesInMonth`: mensual y quincenal nunca cruzan el borde
   *  del mes, sólo semanal puede). */
  months: string[]
  /** Cantidad de días del ciclo: 28–31 en mensual, 13–16 en quincenal, 7 en semanal. */
  days: number
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function monthsTouched(from: Date, to: Date): string[] {
  const start = iso(startOfMonth(from))
  const end = iso(startOfMonth(to))
  return start === end ? [start] : [start, end]
}

// `differenceInCalendarDays`, no resta de milisegundos: `endOfMonth` devuelve las 23:59:59.999 del
// último día, así que comparar timestamps crudos suma casi un día de más (bug real, agarrado por
// el test de días de febrero).
function daysBetweenInclusive(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from) + 1
}

function makeCycle(kind: CycleKind, from: Date, to: Date): Cycle {
  return { id: iso(from), kind, from: iso(from), to: iso(to), months: monthsTouched(from, to), days: daysBetweenInclusive(from, to) }
}

/** Fin de la primera quincena de un mes: siempre el día 15. */
function firstHalfEnd(monthStart: Date): Date {
  return addDays(monthStart, 14)
}

/** Ciclo (mensual, quincenal o semanal) que contiene `date`, según `config`. */
export function cycleContaining(config: CycleConfig, date: Date): Cycle {
  switch (config.kind) {
    case 'monthly':
      return makeCycle('monthly', startOfMonth(date), endOfMonth(date))
    case 'biweekly': {
      const monthStart = startOfMonth(date)
      const day = getDate(date)
      return day <= 15
        ? makeCycle('biweekly', monthStart, firstHalfEnd(monthStart))
        : makeCycle('biweekly', addDays(firstHalfEnd(monthStart), 1), endOfMonth(date))
    }
    case 'weekly': {
      // Réplica manual de startOfWeek/endOfWeek con weekStartsOn configurable (evita depender del
      // parámetro global de date-fns): día de la semana ISO 1..7, offset hacia atrás hasta calzar.
      const isoDow = (date.getDay() + 6) % 7 + 1 // getDay(): 0=domingo..6=sábado → 1=lunes..7=domingo
      const diff = (isoDow - config.weekStartsOn + 7) % 7
      const from = addDays(date, -diff)
      const to = addDays(from, 6)
      return makeCycle('weekly', from, to)
    }
  }
}

/** Reconstruye el ciclo a partir de su `id` (su fecha de inicio) — para navegar por URL o cache key
 *  sin tener que recalcular desde "hoy". */
export function cycleById(config: CycleConfig, id: CycleId): Cycle {
  const from = parseISO(id)
  switch (config.kind) {
    case 'monthly':
      return makeCycle('monthly', from, endOfMonth(from))
    case 'biweekly':
      return getDate(from) === 1
        ? makeCycle('biweekly', from, firstHalfEnd(from))
        : makeCycle('biweekly', from, endOfMonth(from))
    case 'weekly':
      return makeCycle('weekly', from, addDays(from, 6))
  }
}

/** El ciclo `delta` posiciones antes (negativo) o después (positivo) de `cycle`. */
export function shiftCycle(config: CycleConfig, cycle: Cycle, delta: number): Cycle {
  if (delta === 0) return cycle
  const from = parseISO(cycle.from)
  switch (config.kind) {
    case 'monthly':
      return cycleContaining(config, delta > 0 ? addMonths(from, delta) : subMonths(from, -delta))
    case 'biweekly': {
      // Cada mes tiene 2 quincenas: moverse "delta quincenas" es moverse ⌊delta/2⌋ meses + 1
      // quincena si el resto es impar. Se resuelve iterando (delta siempre chico en la UI real: el
      // usuario navega de a una).
      let c = cycle
      const step = delta > 0 ? 1 : -1
      for (let i = 0; i < Math.abs(delta); i++) {
        const anchor = step > 0 ? addDays(parseISO(c.to), 1) : addDays(parseISO(c.from), -1)
        c = cycleContaining(config, anchor)
      }
      return c
    }
    case 'weekly':
      return cycleContaining(config, addDays(from, delta * 7))
  }
}

/** `true` si `cycle` es el que contiene a `today`. FI-09 del QA de Fijos: antes recalculaba el ciclo
 *  de hoy con `weekStartsOn: 1` fijo — con una semana que arranca el domingo, la semana actual nunca
 *  coincidía y Fijos la trataba como otra (sin "Atrasado", "Vence" en vez de "Venció"). Comparar
 *  contra `[from, to]` no necesita saber cómo se armó el ciclo. */
export function isCurrentCycle(cycle: Cycle, today: Date): boolean {
  const t = iso(today)
  return t >= cycle.from && t <= cycle.to
}

/** Label largo para el header de navegación — "septiembre 2026" (mensual), "1–15 sep 2026" /
 *  "16–30 sep 2026" (quincenal), "8–14 sep 2026" (semanal, mismo mes) o "29 sep – 5 oct" (semanal a
 *  caballo de dos meses). */
export function cycleLabel(cycle: Cycle): string {
  const from = parseISO(cycle.from)
  const to = parseISO(cycle.to)
  if (cycle.kind === 'monthly') return format(from, 'MMMM yyyy', { locale: es })

  const sameMonth = cycle.months.length === 1
  if (cycle.kind === 'biweekly') {
    const monthLabel = format(from, 'MMM yyyy', { locale: es })
    return `${getDate(from)}–${getDate(to)} ${monthLabel}`
  }
  // weekly
  if (sameMonth) {
    return `${getDate(from)}–${getDate(to)} ${format(from, 'MMM yyyy', { locale: es })}`
  }
  const sameYear = from.getFullYear() === to.getFullYear()
  const fromLabel = format(from, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: es })
  const toLabel = format(to, 'd MMM yyyy', { locale: es })
  return `${fromLabel} – ${toLabel}`
}

/** Sustantivo de "fin de ___" para los títulos del saldo proyectado — "mes" (mensual), "quincena"
 *  (quincenal) o "semana" (semanal). Antes esos títulos traían "fin de mes" fijo en `Hoy`/`Fijos`/
 *  `MisDeudas`, lo cual quedaba mal con un ciclo quincenal o semanal configurado. */
export function cycleEndNoun(kind: CycleKind): string {
  switch (kind) {
    case 'monthly':
      return 'mes'
    case 'biweekly':
      return 'quincena'
    case 'weekly':
      return 'semana'
  }
}

/** "este mes" / "esta quincena" / "esta semana" — mismo uso que `cycleEndNoun` pero con el
 *  demostrativo concordado en género, para frases tipo "No tenés fijos pendientes {esto}.". */
export function cycleThisLabel(kind: CycleKind): string {
  return kind === 'monthly' ? 'este mes' : `esta ${cycleEndNoun(kind)}`
}

/** "del mes" / "de la quincena" / "de la semana" — con el artículo concordado, para títulos tipo
 *  «Total {esto}», «Pagados {esto}» en Fijos. Antes esos títulos decían fijo "del mes" aunque el
 *  ciclo fuera quincenal o semanal (cobertura nueva del re-test de QA, junto con N2). */
export function cycleOfLabel(kind: CycleKind): string {
  return kind === 'monthly' ? 'del mes' : `de la ${cycleEndNoun(kind)}`
}

/** Versión corta para la píldora de mobile — igual criterio que `MonthNav`'s `mobileLabel`. FI-20 del
 *  QA de Fijos: una semana que cruza de mes decía "28–4 sep" (el mes de `from`, aunque `to` sea de
 *  otro) — con el navegador de arriba diciendo bien "28 sep – 4 oct". Con los dos meses distintos,
 *  cada punta lleva su propio mes: "28 sep – 4 oct". */
export function cycleShortLabel(cycle: Cycle): string {
  if (cycle.kind === 'monthly') return format(parseISO(cycle.from), 'MMMM', { locale: es })
  const from = parseISO(cycle.from)
  const to = parseISO(cycle.to)
  const sameMonth = format(from, 'yyyy-MM') === format(to, 'yyyy-MM')
  if (sameMonth) return `${getDate(from)}–${getDate(to)} ${format(from, 'MMM', { locale: es })}`
  return `${getDate(from)} ${format(from, 'MMM', { locale: es })} – ${getDate(to)} ${format(to, 'MMM', { locale: es })}`
}

// ── El adaptador entre el eje del ciclo y el eje de la obligación mensual ────────────────────────

/** Materializa el vencimiento de una obligación mensual (`dueDay`, 1–31) dentro del mes concreto
 *  `monthStart` (día 1, `'yyyy-MM-dd'`), clampeando a fin de mes — el 31 en febrero cae el 28 (o
 *  29). Espejo exacto en SQL: `public.due_date_in_month`. OJO con la trampa de overflow de
 *  `new Date(y, m, 31)` en meses cortos (devuelve el mes siguiente, NO clampea) — por eso se resuelve
 *  con `Math.min` contra `endOfMonth`, nunca construyendo la fecha directo con el día. */
export function dueDateInMonth(monthStart: string, dueDay: number): string {
  const start = parseISO(monthStart)
  const last = endOfMonth(start)
  const candidate = addDays(start, dueDay - 1)
  return iso(candidate > last ? last : candidate)
}

/** La única regla que decide si una obligación mensual con vencimiento `dueDay` en el mes
 *  `monthStart` cae dentro de `window` — la usan Fijos, Mis Deudas y el saldo proyectado para
 *  filtrar qué se muestra/descuenta. Con `window` = el ciclo mensual de su propio mes es un no-op
 *  matemático: para todo `dueDay` 1–31 el resultado siempre cae dentro, así que el comportamiento
 *  actual no cambia ni un caso. Espejo exacto en SQL del `where` de `rpc_projected_balance_range`.
 *
 *  `window` es `{from, to}`, no un `Cycle` completo a propósito: el caller no siempre quiere el
 *  ciclo que se está MIRANDO — cuando se navega a un ciclo futuro, el saldo proyectado necesita el
 *  HORIZONTE (`projectionWindow`, más abajo), que arranca antes que ese ciclo. Pasar un `Cycle`
 *  entero sigue funcionando (`Cycle` ya tiene `from`/`to`), así que esto no rompe a nadie que hoy le
 *  pase el ciclo tal cual (el caso de Hoy, que nunca navega). */
export function dueFallsInCycle(window: Pick<Cycle, 'from' | 'to'>, monthStart: string, dueDay: number): boolean {
  const due = dueDateInMonth(monthStart, dueDay)
  return due >= window.from && due <= window.to
}

/** N2 del re-test de QA: en ciclo quincenal o semanal, un fijo de una sola vez vencido en un ciclo
 *  ANTERIOR del mismo mes (vence el 15, hoy 22, ciclo 16–30) desaparecía de Hoy, de Fijos y del
 *  proyectado — `dueFallsInCycle`/`fijoCaeEnCiclo` sólo miraban `[window.from, window.to]`, que es
 *  el ciclo NAVEGADO, no el mes completo. Ensancha sólo el borde inferior de la ventana al INICIO
 *  DEL MES de `window.from`; nunca hacia atrás de eso — un vencido de un mes anterior sigue sin
 *  arrastrarse (esa acumulación multi-mes es la que `Fijos.tsx` ya documenta que el cliente no
 *  replica, ver `horizonte` allá). Espejo exacto del mismo cambio en `rpc_projected_balance_range`
 *  (`20260923040001_proyectado_atrasados_del_mes.sql`). En ciclo mensual, `window.from` ya es el
 *  día 1: no-op — nadie en ciclo mensual nota un cambio.
 *
 *  FI-06 del QA de Fijos: también ensancha cuando `window` cruza el borde del mes (una semana 28/9–4/10
 *  arrastra desde el 1/9). Antes no lo hacía, pero la base sí (`date_trunc('month', p_from)` en el
 *  `where`), así que en esa semana el proyectado restaba un atrasado de septiembre que el panel no
 *  mostraba en ninguna línea. */
export function withMonthCarry(window: Pick<Cycle, 'from' | 'to'>): { from: string; to: string } {
  return { from: iso(startOfMonth(parseISO(window.from))), to: window.to }
}

/** Ventana de barrido para el saldo proyectado — deliberadamente NO es `[cycle.from, cycle.to]`.
 *  Un proyectado tiene que ser monótonamente decreciente a medida que se mira más lejos: si sólo
 *  descontara lo que vence DENTRO del ciclo, una deuda impaga del ciclo actual "desaparecería" al
 *  navegar a un ciclo futuro (el proyectado subiría, lo cual no tiene sentido). Por eso el `from`
 *  siempre arranca en el ciclo EN CURSO cuando se mira hacia adelante, acumulando lo impago desde
 *  hoy; mirando hacia atrás, el ciclo pasado se mira a sí mismo (ya cerrado, no acumula más). */
export function projectionWindow(cycle: Cycle, current: Cycle): { from: string; to: string } {
  const from = cycle.from < current.from ? cycle.from : current.from
  return { from, to: cycle.to }
}

/** El ciclo inmediatamente anterior, como rango — reemplaza a `previousRange` de
 *  `features/analytics/period.ts` cuando hay un ciclo configurado: con quincenas de largo desigual
 *  (15 vs. 13–16 días) "los mismos N días para atrás" corre la ventana contra la quincena real. */
export function previousCycleRange(config: CycleConfig, cycle: Cycle): { from: string; to: string } {
  const prev = shiftCycle(config, cycle, -1)
  return { from: prev.from, to: prev.to }
}

const CYCLE_ID_RE = /^\d{4}-\d{2}-\d{2}$/

/** Resuelve qué ciclo mostrar dado el parámetro de URL (o su ausencia) — la pieza pura detrás de
 *  `useCycle`. Separada del hook a propósito: es la única parte de la navegación por ciclo que se
 *  puede testear sin DOM (mismo criterio que el resto del repo, ver README "Tests"). Un `urlId`
 *  ausente, vacío o con formato inválido cae siempre al ciclo que contiene a `today` — nunca
 *  explota con una URL manipulada a mano. */
export function cycleFromUrlParam(config: CycleConfig, urlId: string | null | undefined, today: Date): Cycle {
  if (urlId && CYCLE_ID_RE.test(urlId)) {
    const parsed = parseISO(urlId)
    if (!Number.isNaN(parsed.getTime())) return cycleById(config, urlId)
  }
  return cycleContaining(config, today)
}
