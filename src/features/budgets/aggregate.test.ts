import { describe, expect, it } from 'vitest'
import { projectBudget } from './aggregate'

// `new Date(2026, 7, 20)` (constructor local, mes 0-indexado) en vez de `new Date('2026-08-20')`:
// la forma ISO-string parsea como medianoche UTC, que en cualquier huso con offset negativo cae en
// el día anterior — mismo gotcha documentado en `permiteActualizarPlantilla` de fixed-expenses.
// Acá no aplica `parseISO` porque `projectBudget` recibe `Date`, no strings.

describe('projectBudget', () => {
  it('mes pasado → nada por gastar', () => {
    const p = projectBudget(300_000_00, new Date(2026, 6, 15), new Date(2026, 7, 20))
    expect(p.remainingDays).toBe(0)
    expect(p.remainingCents).toBe(0)
  })

  it('mes futuro → el mes completo por delante', () => {
    const p = projectBudget(300_000_00, new Date(2026, 8, 1), new Date(2026, 7, 20))
    expect(p.remainingDays).toBe(30) // septiembre 2026 tiene 30 días
    expect(p.remainingCents).toBe(300_000_00)
  })

  it('día 1 del mes en curso → el mes completo', () => {
    const p = projectBudget(310_000_00, new Date(2026, 7, 1), new Date(2026, 7, 1))
    expect(p.remainingDays).toBe(31) // agosto tiene 31 días
    expect(p.remainingCents).toBe(310_000_00)
  })

  it('último día del mes en curso → un solo día', () => {
    const p = projectBudget(310_000_00, new Date(2026, 7, 31), new Date(2026, 7, 31))
    expect(p.remainingDays).toBe(1)
    expect(p.remainingCents).toBe(p.dailyCents)
  })

  it('mitad de mes → el caso de ejemplo: $300.000, 31 días, día 20 → 12 días restantes', () => {
    const p = projectBudget(300_000_00, new Date(2026, 7, 20), new Date(2026, 7, 20))
    expect(p.remainingDays).toBe(12)
    expect(p.dailyCents).toBe(967_742) // 30_000_000 / 31, redondeado
    expect(p.remainingCents).toBe(11_612_903) // 30_000_000 * 12 / 31, redondeado
  })

  it('presupuesto en 0 → todo en 0, sin NaN', () => {
    const p = projectBudget(0, new Date(2026, 7, 20), new Date(2026, 7, 20))
    expect(p.dailyCents).toBe(0)
    expect(p.remainingCents).toBe(0)
    expect(Number.isNaN(p.remainingCents)).toBe(false)
  })
})
