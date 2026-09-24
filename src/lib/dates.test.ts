import { describe, expect, it } from 'vitest'
import { endOfLocalDayISO, localTodayISO, msUntilNextDay } from './dates'

// Los casos se arman con fechas locales (`new Date(año, mes, día, hora)`), así dan igual en cualquier
// huso horario del que corra los tests — no se toca `process.env.TZ`, que se comparte entre workers.

describe('localTodayISO', () => {
  // Regresión: la base usaba `current_date` (UTC). En Argentina, a las 22:00 del 30/09 UTC ya es
  // 01/10 — un fijo creado esa noche arrancaba en octubre y no aparecía en septiembre.
  it('a las 22:00 del último día del mes sigue siendo ese día, no el siguiente', () => {
    expect(localTodayISO(new Date(2026, 8, 30, 22, 0))).toBe('2026-09-30')
  })

  it('a las 23:59:59 sigue siendo el mismo día', () => {
    expect(localTodayISO(new Date(2026, 8, 30, 23, 59, 59))).toBe('2026-09-30')
  })

  it('a la medianoche ya es el día siguiente', () => {
    expect(localTodayISO(new Date(2026, 9, 1, 0, 0))).toBe('2026-10-01')
  })
})

describe('endOfLocalDayISO', () => {
  // Regresión: `new Date('2026-09-30').toISOString()` es medianoche UTC — en Argentina, el 29 a las
  // 21:00. Un código de invitación que "vence el 30" dejaba de andar la noche anterior.
  it('vence al final de ese día en hora local', () => {
    const expires = new Date(endOfLocalDayISO('2026-09-30'))
    expect(expires.getFullYear()).toBe(2026)
    expect(expires.getMonth()).toBe(8)
    expect(expires.getDate()).toBe(30)
    expect(expires.getHours()).toBe(23)
    expect(expires.getMinutes()).toBe(59)
    expect(expires.getSeconds()).toBe(59)
  })

  it('a las 23:00 del día elegido, el código todavía no venció', () => {
    const expires = new Date(endOfLocalDayISO('2026-09-30'))
    expect(new Date(2026, 8, 30, 23, 0) < expires).toBe(true)
  })

  it('a la medianoche del día siguiente, ya venció', () => {
    const expires = new Date(endOfLocalDayISO('2026-09-30'))
    expect(new Date(2026, 9, 1, 0, 0) > expires).toBe(true)
  })
})

// FI-23 del QA de Fijos.
describe('msUntilNextDay', () => {
  it('a las 23:58 del 30/9, faltan 2 minutos para el 1/10', () => {
    expect(msUntilNextDay(new Date(2026, 8, 30, 23, 58, 0, 0))).toBe(2 * 60 * 1000)
  })

  it('a la medianoche justo, falta el día entero', () => {
    expect(msUntilNextDay(new Date(2026, 8, 30, 0, 0, 0, 0))).toBe(24 * 60 * 60 * 1000)
  })

  it('a media tarde, falta lo que resta hasta la medianoche', () => {
    expect(msUntilNextDay(new Date(2026, 8, 30, 15, 0, 0, 0))).toBe(9 * 60 * 60 * 1000)
  })
})
