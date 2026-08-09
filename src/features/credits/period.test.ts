import { describe, expect, it } from 'vitest'
import { caeEnPeriodo, numeroDeCuota, ultimoPeriodo } from './period'

describe('numeroDeCuota', () => {
  it('el mismo período que la primera cuota → cuota 1', () => {
    expect(numeroDeCuota('2026-08-01', '2026-08-01')).toBe(1)
  })

  it('11 meses después de la primera cuota (12 cuotas) → cuota 12', () => {
    expect(numeroDeCuota('2026-08-01', '2027-07-01')).toBe(12)
  })

  it('cruce de año: primera cuota en noviembre, 4 meses después → cuota 4 en febrero', () => {
    expect(numeroDeCuota('2026-11-01', '2027-03-01')).toBe(5)
    expect(numeroDeCuota('2026-11-01', '2027-02-01')).toBe(4)
  })

  it('período anterior a la primera cuota → número ≤ 0, no explota', () => {
    expect(numeroDeCuota('2026-08-01', '2026-07-01')).toBe(0)
  })

  it('el día 1 del mes en curso — el borde que revienta con new Date(string) por el corrimiento UTC', () => {
    // '2026-08-01' con `new Date(...)` parsea como medianoche UTC = 31/07 21:00 en Argentina
    // (UTC-3) — con ese bug esto daría 0, no 1. parseISO evita el corrimiento.
    expect(numeroDeCuota('2026-08-01', '2026-08-01')).toBe(1)
  })
})

describe('caeEnPeriodo', () => {
  it('compra de 1 cuota: cae en su propio mes', () => {
    expect(caeEnPeriodo('2026-08-01', 1, '2026-08-01')).toBe(true)
  })

  it('compra de 1 cuota: NO cae al mes siguiente — el requisito central del feature', () => {
    expect(caeEnPeriodo('2026-08-01', 1, '2026-09-01')).toBe(false)
  })

  it('12 cuotas, +11 meses (la última) → cae', () => {
    expect(caeEnPeriodo('2026-08-01', 12, '2027-07-01')).toBe(true)
  })

  it('12 cuotas, +12 meses (una de más) → no cae, borde superior exclusivo', () => {
    expect(caeEnPeriodo('2026-08-01', 12, '2027-08-01')).toBe(false)
  })

  it('período anterior a la primera cuota → no cae', () => {
    expect(caeEnPeriodo('2026-08-01', 12, '2026-07-01')).toBe(false)
  })
})

describe('ultimoPeriodo', () => {
  it('12 cuotas desde agosto 2026 → julio 2027', () => {
    expect(ultimoPeriodo('2026-08-01', 12)).toBe('2027-07-01')
  })

  it('1 cuota → el mismo mes', () => {
    expect(ultimoPeriodo('2026-08-01', 1)).toBe('2026-08-01')
  })

  it('cruce de año: 4 cuotas desde noviembre 2026 → febrero 2027', () => {
    expect(ultimoPeriodo('2026-11-01', 4)).toBe('2027-02-01')
  })
})
