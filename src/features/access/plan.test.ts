import { describe, expect, it } from 'vitest'
import { can, FALLBACK_PLAN, PLANS } from './plan'
import type { Capability, Plan } from './plan'

const ALL_CAPS: Capability[] = [
  'movimientos',
  'fijos',
  'analisis',
  'ahorros',
  'mis-deudas',
  'me-deben',
  'ajustes-completo',
  'cuentas',
  'compartido',
  'movimientos-manuales',
]

describe('can', () => {
  it('premium tiene absolutamente todo — si se agrega una capacidad nueva y se olvida acá, esto rompe', () => {
    for (const cap of ALL_CAPS) expect(can('premium', cap)).toBe(true)
  })

  it('basic no tiene análisis ni nada de lo restringido a premium, ni movimientos manuales', () => {
    expect(can('basic', 'movimientos')).toBe(true)
    expect(can('basic', 'fijos')).toBe(true)
    expect(can('basic', 'analisis')).toBe(false)
    expect(can('basic', 'ahorros')).toBe(false)
    expect(can('basic', 'cuentas')).toBe(false)
    expect(can('basic', 'movimientos-manuales')).toBe(false)
  })

  it('test ve análisis, movimientos manuales y cuentas, pero no compartido ni los ajustes completos', () => {
    expect(can('test', 'movimientos')).toBe(true)
    expect(can('test', 'fijos')).toBe(true)
    expect(can('test', 'analisis')).toBe(true)
    expect(can('test', 'movimientos-manuales')).toBe(true)
    expect(can('test', 'cuentas')).toBe(true)
    expect(can('test', 'compartido')).toBe(false)
    expect(can('test', 'ahorros')).toBe(false)
    expect(can('test', 'ajustes-completo')).toBe(false)
  })

  it('PLANS lista los tres, para los selectores de admin', () => {
    const expected: Plan[] = ['test', 'basic', 'premium']
    expect(PLANS).toEqual(expected)
  })
})

describe('FALLBACK_PLAN', () => {
  // Regresión: el respaldo mientras el perfil no está (o falló la consulta) era `'test'`, con el
  // comentario "el más restrictivo". Lo fue hasta que apareció Básico — desde ahí Test es el plan del
  // medio, y una cuenta Básico con el perfil caído veía Análisis, Cuentas y el `+` de movimiento
  // manual. El respaldo tiene que ser el plan con menos capacidades, no uno fijo por costumbre.
  it('no tiene ninguna capacidad que le falte a otro plan', () => {
    for (const plan of PLANS) {
      for (const cap of ALL_CAPS) {
        if (can(FALLBACK_PLAN, cap)) expect(can(plan, cap)).toBe(true)
      }
    }
  })

  it('es Básico', () => {
    expect(FALLBACK_PLAN).toBe('basic')
  })
})
