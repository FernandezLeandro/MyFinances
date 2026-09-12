import { describe, expect, it } from 'vitest'
import { cycleContaining, type CycleConfig } from '@/lib/cycle'
import {
  cycleMonthsBounds,
  dueDateInCycle,
  eligibleFixedExpenses,
  fijoCaeEnCiclo,
  fijoCaeEnCicloMultiMes,
  permiteActualizarPlantilla,
} from './period'
import type { FixedExpense } from './api'

function fe(overrides: Partial<FixedExpense>): FixedExpense {
  return {
    id: 'x',
    user_id: 'u',
    name: 'Test',
    cents: 1000,
    category_id: null,
    due_day: 10,
    is_active: true,
    is_recurring: false,
    bag_frequency: 'monthly',
    starts_on: '2026-01-01',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('permiteActualizarPlantilla', () => {
  it('mes pasado → false', () => {
    expect(permiteActualizarPlantilla('2026-07-01', new Date('2026-08-15T12:00:00'))).toBe(false)
  })

  it('mes en curso → true', () => {
    expect(permiteActualizarPlantilla('2026-08-01', new Date('2026-08-15T12:00:00'))).toBe(true)
  })

  it('mes futuro → true', () => {
    expect(permiteActualizarPlantilla('2026-09-01', new Date('2026-08-15T12:00:00'))).toBe(true)
  })

  it('el día 1 del mes en curso — el borde que revienta con new Date(string) por el corrimiento UTC', () => {
    // '2026-08-01' con `new Date(...)` parsea como medianoche UTC = 31/07 21:00 en Argentina
    // (UTC-3) — con ese bug, esto daría `false` en vez de `true`. parseISO no tiene ese problema.
    expect(permiteActualizarPlantilla('2026-08-01', new Date('2026-08-01T09:00:00'))).toBe(true)
  })

  it('el último día del mes pasado, justo antes de cruzar a agosto → sigue siendo mes pasado', () => {
    expect(permiteActualizarPlantilla('2026-07-01', new Date('2026-08-01T00:00:01'))).toBe(false)
  })
})

describe('eligibleFixedExpenses', () => {
  const periodEnd = new Date('2026-08-31')

  it('excluye un fijo que todavía no empezó', () => {
    const items = [fe({ starts_on: '2026-09-01' })]
    expect(eligibleFixedExpenses(items, periodEnd)).toHaveLength(0)
  })

  it('incluye un fijo vigente', () => {
    const items = [fe({ starts_on: '2026-01-01' })]
    expect(eligibleFixedExpenses(items, periodEnd)).toHaveLength(1)
  })
})

describe('fijoCaeEnCiclo', () => {
  const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }
  const biweekly: CycleConfig = { kind: 'biweekly', weekStartsOn: 1 }

  it('con ciclo mensual, cualquier due_day cae siempre — no-op de retrocompatibilidad', () => {
    const cycle = cycleContaining(monthly, new Date(2026, 8, 10, 12))
    for (let due = 1; due <= 31; due++) {
      expect(fijoCaeEnCiclo(fe({ due_day: due }), '2026-09-01', cycle)).toBe(true)
    }
  })

  it('con ciclo quincenal, un fijo que vence el 5 cae sólo en la primera quincena', () => {
    const first = cycleContaining(biweekly, new Date(2026, 8, 5, 12))
    const second = cycleContaining(biweekly, new Date(2026, 8, 20, 12))
    const alquiler = fe({ due_day: 5 })
    expect(fijoCaeEnCiclo(alquiler, '2026-09-01', first)).toBe(true)
    expect(fijoCaeEnCiclo(alquiler, '2026-09-01', second)).toBe(false)
  })

  it('una bolsa (is_recurring, sin due_day) siempre da true — no la evalúa esta función', () => {
    const cycle = cycleContaining(biweekly, new Date(2026, 8, 20, 12))
    const bolsa = fe({ is_recurring: true, due_day: null })
    expect(fijoCaeEnCiclo(bolsa, '2026-09-01', cycle)).toBe(true)
  })
})

// Bloque 5 del plan (ciclo semanal): un ciclo puede tocar DOS meses. `fijoCaeEnCicloMultiMes` y
// `dueDateInCycle` generalizan `fijoCaeEnCiclo` a esa lista de meses en vez de uno solo.
describe('fijoCaeEnCicloMultiMes / dueDateInCycle', () => {
  const weekly: CycleConfig = { kind: 'weekly', weekStartsOn: 1 }
  // Semana 29 sep – 5 oct, a caballo de dos meses.
  const semanaACaballo = cycleContaining(weekly, new Date(2026, 8, 30, 12))

  it('con un solo mes, es idéntico a fijoCaeEnCiclo (mensual/quincenal, nunca cruzan)', () => {
    const alquiler = fe({ due_day: 5 })
    expect(fijoCaeEnCicloMultiMes(alquiler, ['2026-09-01'], semanaACaballo)).toBe(
      fijoCaeEnCiclo(alquiler, '2026-09-01', semanaACaballo),
    )
  })

  it('un vencimiento del SEGUNDO mes de la semana cae adentro sólo si se prueban los dos meses', () => {
    const vence2 = fe({ due_day: 2 }) // 2 de octubre, dentro de la semana
    expect(fijoCaeEnCiclo(vence2, '2026-09-01', semanaACaballo)).toBe(false) // sólo probó septiembre
    expect(fijoCaeEnCicloMultiMes(vence2, ['2026-09-01', '2026-10-01'], semanaACaballo)).toBe(true)
    expect(dueDateInCycle(vence2, ['2026-09-01', '2026-10-01'], semanaACaballo)).toBe('2026-10-02')
  })

  it('un vencimiento del PRIMER mes que cae fuera de la semana da null/false, aunque el segundo mes exista', () => {
    const vence10 = fe({ due_day: 10 }) // 10 de septiembre, fuera de la semana (29 sep–5 oct)
    expect(fijoCaeEnCicloMultiMes(vence10, ['2026-09-01', '2026-10-01'], semanaACaballo)).toBe(false)
    expect(dueDateInCycle(vence10, ['2026-09-01', '2026-10-01'], semanaACaballo)).toBeNull()
  })

  it('una bolsa siempre da null en dueDateInCycle — no tiene vencimiento', () => {
    const bolsa = fe({ is_recurring: true, due_day: null })
    expect(dueDateInCycle(bolsa, ['2026-09-01', '2026-10-01'], semanaACaballo)).toBeNull()
  })
})

describe('cycleMonthsBounds', () => {
  it('con un solo mes, los límites son ese mes calendario completo', () => {
    const { start, end } = cycleMonthsBounds(['2026-09-01'])
    expect(start).toEqual(new Date(2026, 8, 1))
    expect(end).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999))
  })

  it('con dos meses, cubre desde el inicio del primero hasta el fin del segundo', () => {
    const { start, end } = cycleMonthsBounds(['2026-09-01', '2026-10-01'])
    expect(start).toEqual(new Date(2026, 8, 1))
    expect(end).toEqual(new Date(2026, 9, 31, 23, 59, 59, 999))
  })
})
