import { describe, expect, it } from 'vitest'
import { cycleContaining, type CycleConfig } from '@/lib/cycle'
import { eligibleFixedExpenses, fijoCaeEnCiclo, permiteActualizarPlantilla } from './period'
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
    starts_on: '2026-01-01',
    ends_on: null,
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
  const periodStart = new Date('2026-08-01')
  const periodEnd = new Date('2026-08-31')

  it('excluye un fijo que todavía no empezó', () => {
    const items = [fe({ starts_on: '2026-09-01' })]
    expect(eligibleFixedExpenses(items, periodStart, periodEnd)).toHaveLength(0)
  })

  it('excluye un fijo dado de baja antes de este período', () => {
    const items = [fe({ ends_on: '2026-07-15' })]
    expect(eligibleFixedExpenses(items, periodStart, periodEnd)).toHaveLength(0)
  })

  it('incluye un fijo vigente sin fecha de baja', () => {
    const items = [fe({ starts_on: '2026-01-01', ends_on: null })]
    expect(eligibleFixedExpenses(items, periodStart, periodEnd)).toHaveLength(1)
  })

  it('incluye un fijo que se da de baja recién el mes que viene', () => {
    const items = [fe({ ends_on: '2026-09-01' })]
    expect(eligibleFixedExpenses(items, periodStart, periodEnd)).toHaveLength(1)
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
