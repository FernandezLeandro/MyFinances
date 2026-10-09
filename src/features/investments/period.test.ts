import { describe, expect, it } from 'vitest'
import { inRange, rangeFor, rangeLabel, shiftAnchor, slotsFor } from './period'

// Miércoles 7 de octubre de 2026 (hora local, sin saltos de zona).
const ANCHOR = new Date(2026, 9, 7)

describe('rangeFor', () => {
  it('semana lunes-domingo, mes y año calendario; Todo no tiene rango', () => {
    expect(rangeFor('week', ANCHOR)).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('month', ANCHOR)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeFor('year', ANCHOR)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(rangeFor('all', ANCHOR)).toBeNull()
  })
})

describe('shiftAnchor', () => {
  it('mueve una semana, un mes o un año, y cruza el borde de año', () => {
    expect(rangeFor('week', shiftAnchor('week', new Date(2026, 0, 2), -1))).toEqual({ from: '2025-12-22', to: '2025-12-28' })
    expect(rangeFor('month', shiftAnchor('month', new Date(2026, 0, 15), -1))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(rangeFor('year', shiftAnchor('year', ANCHOR, 1))?.from).toBe('2027-01-01')
  })

  it('en Todo no mueve nada', () => {
    expect(shiftAnchor('all', ANCHOR, 1)).toBe(ANCHOR)
  })
})

describe('rangeLabel', () => {
  it('describe cada período', () => {
    expect(rangeLabel('month', ANCHOR)).toBe('Octubre 2026')
    expect(rangeLabel('year', ANCHOR)).toBe('2026')
    expect(rangeLabel('all', ANCHOR)).toBe('Todo el historial')
    expect(rangeLabel('week', ANCHOR)).toContain('5 – 11')
  })
})

describe('inRange', () => {
  it('incluye los bordes y sin rango entra todo', () => {
    const r = { from: '2026-10-05', to: '2026-10-11' }
    expect(inRange('2026-10-05', r)).toBe(true)
    expect(inRange('2026-10-11', r)).toBe(true)
    expect(inRange('2026-10-12', r)).toBe(false)
    expect(inRange('1999-01-01', null)).toBe(true)
  })
})

describe('slotsFor', () => {
  it('semana → 7 días', () => {
    const slots = slotsFor('week', ANCHOR, null)
    expect(slots).toHaveLength(7)
    expect(slots[0]).toMatchObject({ from: '2026-10-05', to: '2026-10-05' })
  })

  it('mes → semanas recortadas al mes, sin huecos ni solapes', () => {
    const slots = slotsFor('month', ANCHOR, null)
    expect(slots[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-04', label: '1–4' })
    expect(slots.at(-1)?.to).toBe('2026-10-31')
    for (let i = 1; i < slots.length; i++) {
      const prev = new Date(slots[i - 1].to + 'T00:00:00')
      prev.setDate(prev.getDate() + 1)
      expect(slots[i].from).toBe(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`)
    }
  })

  it('año → 12 meses', () => {
    const slots = slotsFor('year', ANCHOR, null)
    expect(slots).toHaveLength(12)
    expect(slots[1]).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('todo → un año por barra desde la primera inversión', () => {
    expect(slotsFor('all', ANCHOR, '2024-05-10', ANCHOR).map((s) => s.label)).toEqual(['2024', '2025', '2026'])
    expect(slotsFor('all', ANCHOR, null, ANCHOR).map((s) => s.label)).toEqual(['2026'])
  })
})
