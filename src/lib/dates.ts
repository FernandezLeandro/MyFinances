import { addDays, endOfDay, format, parseISO, startOfDay } from 'date-fns'

/**
 * La fecha de hoy en la hora local del navegador, como `yyyy-MM-dd`.
 *
 * Es la que se le manda a la base cuando una RPC necesita saber "qué día es hoy": `current_date` de
 * Supabase es UTC, así que en Argentina, pasadas las 21:00, ya es el día siguiente — un fijo creado
 * esa noche arrancaba el mes que viene, y el proyectado del último día del mes daba por cerrado el
 * mes actual. Nunca `toISOString().slice(0, 10)`: eso también es UTC.
 */
export function localTodayISO(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

/**
 * El último instante de un día `yyyy-MM-dd` en hora local, como timestamp ISO (UTC) — para un
 * "vence el …" elegido con un `<input type="date">`. `new Date('2026-09-30')` se parsea como
 * medianoche UTC, que en Argentina es el 29 a las 21:00: el código vencía casi un día antes.
 */
export function endOfLocalDayISO(date: string): string {
  return endOfDay(parseISO(date)).toISOString()
}

/** Milisegundos hasta la próxima medianoche local, en base a `now`. FI-23 del QA de Fijos: con la
 *  app abierta y sin recargar, un `useMemo(() => new Date(), [])` congelaba "hoy" al instante en que
 *  se montó la pantalla — a la medianoche del 30/9 al 1/10, Fijos seguía en septiembre. Lo usa
 *  `useToday` para programar un `setTimeout` que recalcula justo al cruzar el día. */
export function msUntilNextDay(now: Date = new Date()): number {
  return startOfDay(addDays(now, 1)).getTime() - now.getTime()
}
