import { describe, expect, it } from 'vitest'
import { can, PLANS } from './plan'
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
  'cuadrar-saldo',
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

  it('test ve análisis y movimientos manuales, pero no cuentas, compartido ni cuadrar saldo', () => {
    expect(can('test', 'movimientos')).toBe(true)
    expect(can('test', 'fijos')).toBe(true)
    expect(can('test', 'analisis')).toBe(true)
    expect(can('test', 'movimientos-manuales')).toBe(true)
    expect(can('test', 'cuentas')).toBe(false)
    expect(can('test', 'compartido')).toBe(false)
    expect(can('test', 'cuadrar-saldo')).toBe(false)
    expect(can('test', 'ajustes-completo')).toBe(false)
  })

  it('PLANS lista los tres, para los selectores de admin', () => {
    const expected: Plan[] = ['test', 'basic', 'premium']
    expect(PLANS).toEqual(expected)
  })
})
