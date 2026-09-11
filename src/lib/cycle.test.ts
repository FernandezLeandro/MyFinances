import { describe, expect, it } from 'vitest'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import {
  type CycleConfig,
  cycleById,
  cycleContaining,
  cycleFromUrlParam,
  cycleLabel,
  DEFAULT_CYCLE_CONFIG,
  dueDateInMonth,
  dueFallsInCycle,
  isCurrentCycle,
  previousCycleRange,
  projectionWindow,
  shiftCycle,
} from './cycle'

const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }
const biweekly: CycleConfig = { kind: 'biweekly', weekStartsOn: 1 }
const weekly: CycleConfig = { kind: 'weekly', weekStartsOn: 1 }

describe('DEFAULT_CYCLE_CONFIG', () => {
  it('es mensual — default de todo usuario sin configurar', () => {
    expect(DEFAULT_CYCLE_CONFIG.kind).toBe('monthly')
  })
})

describe('cycleContaining — no-regresión contra el comportamiento actual', () => {
  it('monthly devuelve exactamente startOfMonth/endOfMonth para cualquier día del mes', () => {
    for (const day of [1, 5, 15, 28, 30]) {
      const d = new Date(2026, 8, day, 12) // septiembre 2026, 30 días
      const cycle = cycleContaining(monthly, d)
      expect(cycle.from).toBe(format(startOfMonth(d), 'yyyy-MM-dd'))
      expect(cycle.to).toBe(format(endOfMonth(d), 'yyyy-MM-dd'))
      expect(cycle.months).toEqual(['2026-09-01'])
    }
  })

  it('monthly en febrero bisiesto (2028) cierra el 29', () => {
    const cycle = cycleContaining(monthly, new Date(2028, 1, 10, 12))
    expect(cycle.to).toBe('2028-02-29')
    expect(cycle.days).toBe(29)
  })

  it('monthly en febrero no bisiesto (2026) cierra el 28', () => {
    const cycle = cycleContaining(monthly, new Date(2026, 1, 10, 12))
    expect(cycle.to).toBe('2026-02-28')
    expect(cycle.days).toBe(28)
  })
})

describe('cycleContaining — biweekly', () => {
  it('día 1–15 → primera quincena', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 8, 10, 12))
    expect(cycle).toMatchObject({ from: '2026-09-01', to: '2026-09-15', days: 15, months: ['2026-09-01'] })
  })

  it('día 16–fin → segunda quincena, sin cruzar el mes', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 8, 20, 12))
    expect(cycle).toMatchObject({ from: '2026-09-16', to: '2026-09-30', days: 15, months: ['2026-09-01'] })
  })

  it('mes de 28 días: segunda quincena tiene 13 días', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 1, 20, 12))
    expect(cycle).toMatchObject({ from: '2026-02-16', to: '2026-02-28', days: 13 })
  })

  it('mes de 31 días: segunda quincena tiene 16 días', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 9, 20, 12))
    expect(cycle).toMatchObject({ from: '2026-10-16', to: '2026-10-31', days: 16 })
  })
})

describe('cycleContaining — weekly', () => {
  it('semana lunes a domingo dentro del mismo mes', () => {
    // 8 de septiembre de 2026 es martes
    const cycle = cycleContaining(weekly, new Date(2026, 8, 8, 12))
    expect(cycle).toMatchObject({ from: '2026-09-07', to: '2026-09-13', days: 7, months: ['2026-09-01'] })
  })

  it('semana a caballo de dos meses toca los dos', () => {
    // 30 de septiembre de 2026 es miércoles → semana 28 sep – 4 oct
    const cycle = cycleContaining(weekly, new Date(2026, 8, 30, 12))
    expect(cycle).toMatchObject({ from: '2026-09-28', to: '2026-10-04', days: 7, months: ['2026-09-01', '2026-10-01'] })
  })

  it('semana a caballo de dos años', () => {
    // 31 de diciembre de 2026 es jueves → semana 28 dic – 3 ene
    const cycle = cycleContaining(weekly, new Date(2026, 11, 31, 12))
    expect(cycle.from).toBe('2026-12-28')
    expect(cycle.to).toBe('2027-01-03')
  })

  it('weekStartsOn distinto (domingo=7) corre la ventana', () => {
    const sundayStart: CycleConfig = { kind: 'weekly', weekStartsOn: 7 }
    const cycle = cycleContaining(sundayStart, new Date(2026, 8, 8, 12)) // martes
    expect(cycle).toMatchObject({ from: '2026-09-06', to: '2026-09-12' })
  })
})

describe('cycleById', () => {
  it('reconstruye el mismo ciclo que cycleContaining para los 3 kinds', () => {
    for (const config of [monthly, biweekly, weekly]) {
      const original = cycleContaining(config, new Date(2026, 8, 10, 12))
      expect(cycleById(config, original.id)).toEqual(original)
    }
  })
})

describe('shiftCycle — ida y vuelta', () => {
  it('shift(shift(c, 1), -1) === c para los 3 kinds', () => {
    for (const config of [monthly, biweekly, weekly]) {
      const c = cycleContaining(config, new Date(2026, 8, 10, 12))
      const roundTrip = shiftCycle(config, shiftCycle(config, c, 1), -1)
      expect(roundTrip).toEqual(c)
    }
  })

  it('monthly cruza fin de año', () => {
    const dec = cycleContaining(monthly, new Date(2026, 11, 15, 12))
    const jan = shiftCycle(monthly, dec, 1)
    expect(jan.from).toBe('2027-01-01')
  })

  it('biweekly avanza de la primera a la segunda quincena del mismo mes', () => {
    const first = cycleContaining(biweekly, new Date(2026, 8, 5, 12))
    const second = shiftCycle(biweekly, first, 1)
    expect(second.from).toBe('2026-09-16')
  })

  it('biweekly retrocede de la primera quincena al mes anterior', () => {
    const first = cycleContaining(biweekly, new Date(2026, 8, 5, 12))
    const prev = shiftCycle(biweekly, first, -1)
    expect(prev.from).toBe('2026-08-16')
  })

  it('weekly cruza fin de año hacia adelante', () => {
    const lastWeekOfYear = cycleContaining(weekly, new Date(2026, 11, 31, 12))
    const next = shiftCycle(weekly, lastWeekOfYear, 1)
    expect(next.from).toBe('2027-01-04')
  })
})

describe('isCurrentCycle', () => {
  it('true para el ciclo que contiene a today', () => {
    const today = new Date(2026, 8, 10, 12)
    const cycle = cycleContaining(monthly, today)
    expect(isCurrentCycle(cycle, today)).toBe(true)
  })

  it('false para un ciclo pasado', () => {
    const today = new Date(2026, 8, 10, 12)
    const cycle = cycleContaining(monthly, new Date(2026, 7, 10, 12))
    expect(isCurrentCycle(cycle, today)).toBe(false)
  })
})

describe('cycleLabel', () => {
  it('monthly: "septiembre 2026"', () => {
    expect(cycleLabel(cycleContaining(monthly, new Date(2026, 8, 10, 12)))).toBe('septiembre 2026')
  })

  it('biweekly: "1–15 sep 2026"', () => {
    expect(cycleLabel(cycleContaining(biweekly, new Date(2026, 8, 10, 12)))).toBe('1–15 sep 2026')
  })

  it('weekly mismo mes: "7–13 sep 2026"', () => {
    expect(cycleLabel(cycleContaining(weekly, new Date(2026, 8, 8, 12)))).toBe('7–13 sep 2026')
  })

  it('weekly a caballo de mes', () => {
    const label = cycleLabel(cycleContaining(weekly, new Date(2026, 8, 30, 12)))
    expect(label).toBe('28 sep – 4 oct 2026')
  })
})

describe('dueDateInMonth — clamp de vencimiento a fin de mes', () => {
  it('día normal, sin clamp', () => {
    expect(dueDateInMonth('2026-09-01', 10)).toBe('2026-09-10')
  })

  it('día 31 en mes de 30 clampea al 30', () => {
    expect(dueDateInMonth('2026-09-01', 31)).toBe('2026-09-30')
  })

  it('día 31 en febrero no bisiesto clampea al 28', () => {
    expect(dueDateInMonth('2026-02-01', 31)).toBe('2026-02-28')
  })

  it('día 31 en febrero bisiesto clampea al 29', () => {
    expect(dueDateInMonth('2028-02-01', 31)).toBe('2028-02-29')
  })

  it('día 1 nunca clampea', () => {
    expect(dueDateInMonth('2026-02-01', 1)).toBe('2026-02-01')
  })
})

describe('dueFallsInCycle — el invariante que sostiene la retrocompatibilidad', () => {
  it('con ciclo mensual, TODO dueDay 1–31 cae siempre dentro del ciclo de su propio mes (no-op)', () => {
    for (let month = 0; month < 12; month++) {
      const cycle = cycleContaining(monthly, new Date(2026, month, 10, 12))
      for (let dueDay = 1; dueDay <= 31; dueDay++) {
        expect(dueFallsInCycle(cycle, cycle.from, dueDay)).toBe(true)
      }
    }
  })

  it('con ciclo quincenal, las dos quincenas de un mes particionan 1–31 sin huecos ni solapes', () => {
    const monthStart = '2026-09-01' // septiembre, 30 días
    const first = cycleContaining(biweekly, new Date(2026, 8, 5, 12))
    const second = cycleContaining(biweekly, new Date(2026, 8, 20, 12))
    for (let dueDay = 1; dueDay <= 30; dueDay++) {
      const inFirst = dueFallsInCycle(first, monthStart, dueDay)
      const inSecond = dueFallsInCycle(second, monthStart, dueDay)
      expect(inFirst !== inSecond).toBe(true) // exactamente una de las dos
    }
  })

  it('con ciclo semanal, las semanas del mes particionan 1–30 sin huecos ni solapes', () => {
    const monthStart = '2026-09-01'
    let cursor = new Date(2026, 8, 1, 12)
    const weeksSeen: ReturnType<typeof cycleContaining>[] = []
    while (cursor.getMonth() === 8) {
      const cycle = cycleContaining(weekly, cursor)
      if (!weeksSeen.some((w) => w.id === cycle.id)) weeksSeen.push(cycle)
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12)
    }
    for (let dueDay = 1; dueDay <= 30; dueDay++) {
      const matches = weeksSeen.filter((w) => dueFallsInCycle(w, monthStart, dueDay))
      expect(matches.length).toBe(1)
    }
  })
})

describe('projectionWindow — el horizonte, no la ventana simétrica (agujero 1 del plan)', () => {
  const current = cycleContaining(biweekly, new Date(2026, 8, 10, 12)) // 1–15 sep

  it('ciclo pasado: la ventana es el propio ciclo (ya cerrado, no acumula)', () => {
    const past = shiftCycle(biweekly, current, -1) // 16–31 ago
    expect(projectionWindow(past, current)).toEqual({ from: past.from, to: past.to })
  })

  it('ciclo en curso: la ventana es el propio ciclo', () => {
    expect(projectionWindow(current, current)).toEqual({ from: current.from, to: current.to })
  })

  it('ciclo futuro: arranca en el ciclo EN CURSO, no en el futuro — así no se pierde lo impago', () => {
    const future = shiftCycle(biweekly, current, 2) // 16–30 sep
    expect(projectionWindow(future, current)).toEqual({ from: current.from, to: future.to })
  })
})

describe('cycleFromUrlParam', () => {
  const today = new Date(2026, 8, 10, 12) // 10 de septiembre de 2026

  it('sin parámetro (null) → el ciclo que contiene a today', () => {
    expect(cycleFromUrlParam(monthly, null, today)).toEqual(cycleContaining(monthly, today))
  })

  it('sin parámetro (undefined) → el ciclo que contiene a today', () => {
    expect(cycleFromUrlParam(biweekly, undefined, today)).toEqual(cycleContaining(biweekly, today))
  })

  it('string vacío → el ciclo que contiene a today (no explota)', () => {
    expect(cycleFromUrlParam(weekly, '', today)).toEqual(cycleContaining(weekly, today))
  })

  it('id válido → reconstruye ese ciclo exacto, no el de today', () => {
    const target = cycleContaining(biweekly, new Date(2026, 5, 20, 12)) // junio, otra quincena
    expect(cycleFromUrlParam(biweekly, target.id, today)).toEqual(target)
  })

  it('formato inválido (no yyyy-MM-dd) → cae a today, no explota', () => {
    expect(cycleFromUrlParam(monthly, 'no-es-una-fecha', today)).toEqual(cycleContaining(monthly, today))
    expect(cycleFromUrlParam(monthly, '2026-9-1', today)).toEqual(cycleContaining(monthly, today))
    expect(cycleFromUrlParam(monthly, '../../../etc', today)).toEqual(cycleContaining(monthly, today))
  })

  it('fecha con formato válido pero valores imposibles → cae a today, no explota', () => {
    expect(cycleFromUrlParam(monthly, '2026-13-45', today)).toEqual(cycleContaining(monthly, today))
  })
})

describe('previousCycleRange', () => {
  it('quincena: el anterior a 16–30 sep es 1–15 sep, sin desfasaje de un día', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 8, 20, 12))
    expect(previousCycleRange(biweekly, cycle)).toEqual({ from: '2026-09-01', to: '2026-09-15' })
  })

  it('mensual: el anterior a septiembre es agosto completo', () => {
    const cycle = cycleContaining(monthly, new Date(2026, 8, 10, 12))
    expect(previousCycleRange(monthly, cycle)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })
})
