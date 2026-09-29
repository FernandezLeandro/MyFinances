import { describe, expect, it } from 'vitest'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import type { CycleConfig } from '@/lib/cycle'
import { periodRange, periodRangeLabel, type MovementPeriod } from './movementPeriod'

// `new Date(2026, 8, 10)` (constructor local) — mismo gotcha de siempre con `new Date(string)`.
const ANCHOR = format(new Date(2026, 8, 10), 'yyyy-MM-dd')

const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }
const biweekly: CycleConfig = { kind: 'biweekly', weekStartsOn: 1 }

function monthPeriod(anchor: string): MovementPeriod {
  return { preset: 'month', anchor, from: '', to: '' }
}

describe('periodRange — preset "month" con ciclo configurado', () => {
  it('sin config (default), el preset month es el mes calendario de siempre', () => {
    const { from, to } = periodRange(monthPeriod(ANCHOR))
    expect(from).toBe(format(startOfMonth(new Date(2026, 8, 10)), 'yyyy-MM-dd'))
    expect(to).toBe(format(endOfMonth(new Date(2026, 8, 10)), 'yyyy-MM-dd'))
  })

  it('con config mensual explícita, no-op — idéntico al default', () => {
    const withConfig = periodRange(monthPeriod(ANCHOR), monthly)
    const withoutConfig = periodRange(monthPeriod(ANCHOR))
    expect(withConfig).toEqual(withoutConfig)
  })

  it('con config quincenal, el preset "month" pasa a representar la quincena en curso', () => {
    const { from, to } = periodRange(monthPeriod(ANCHOR), biweekly)
    // ANCHOR = 10 de septiembre → primera quincena.
    expect(from).toBe('2026-09-01')
    expect(to).toBe('2026-09-15')
  })

  it('otros presets no cambian aunque se pase una config no mensual', () => {
    const todayPeriod: MovementPeriod = { preset: 'today', anchor: ANCHOR, from: '', to: '' }
    expect(periodRange(todayPeriod, biweekly)).toEqual(periodRange(todayPeriod, monthly))
  })

  it('preset "custom" ignora la config por completo, usa from/to tal cual', () => {
    const custom: MovementPeriod = { preset: 'custom', anchor: ANCHOR, from: '2020-01-01', to: '2020-01-31' }
    expect(periodRange(custom, biweekly)).toEqual({ from: '2020-01-01', to: '2020-01-31' })
  })
})

describe('periodRangeLabel — rango compacto del campo-botón de Período', () => {
  it('mismo mes: no repite el mes', () => {
    expect(periodRangeLabel('2026-09-01', '2026-09-30')).toBe('1 – 30 sep')
  })

  it('cruza de mes: cada punta lleva su mes', () => {
    expect(periodRangeLabel('2026-08-28', '2026-09-05')).toBe('28 ago – 5 sep')
  })

  it('un solo día (Hoy/Ayer): una sola fecha, sin guion', () => {
    expect(periodRangeLabel('2026-09-27', '2026-09-27')).toBe('27 sep')
  })
})
