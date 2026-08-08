import { describe, expect, it } from 'vitest'
import { permiteActualizarPlantilla } from './period'

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
