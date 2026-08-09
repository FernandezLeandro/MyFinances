import { describe, expect, it } from 'vitest'
import { reconciliar } from './aggregate'
import { makeLocation } from '@/test/factories'

describe('reconciliar', () => {
  it('sin lugares → total 0 y diferencia igual al saldo entero, sin romper', () => {
    const r = reconciliar([], 15_000_00)
    expect(r.totalCents).toBe(0)
    expect(r.diffCents).toBe(-15_000_00)
    expect(r.cuadrado).toBe(false)
  })

  it('suma de lugares > saldo → diferencia positiva, falta un ingreso', () => {
    const locations = [makeLocation({ amountCents: 100_000 }), makeLocation({ amountCents: 60_000 })]
    const r = reconciliar(locations, 150_000)
    expect(r.totalCents).toBe(160_000)
    expect(r.diffCents).toBe(10_000)
  })

  it('suma de lugares < saldo → diferencia negativa, falta un gasto', () => {
    const locations = [makeLocation({ amountCents: 50_000 }), makeLocation({ amountCents: 20_000 })]
    const r = reconciliar(locations, 150_000)
    expect(r.totalCents).toBe(70_000)
    expect(r.diffCents).toBe(-80_000)
  })

  it('suma exacta → cuadrado true y diferencia 0', () => {
    const locations = [makeLocation({ amountCents: 150_000 })]
    const r = reconciliar(locations, 150_000)
    expect(r.diffCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('un lugar en negativo (cuenta en descubierto) resta del total', () => {
    const locations = [makeLocation({ amountCents: 100_000 }), makeLocation({ amountCents: -20_000 })]
    const r = reconciliar(locations, 0)
    expect(r.totalCents).toBe(80_000)
    expect(r.diffCents).toBe(80_000)
  })

  it('saldo en 0 con lugares cargados → diferencia igual al total', () => {
    const locations = [makeLocation({ amountCents: 30_000 })]
    const r = reconciliar(locations, 0)
    expect(r.diffCents).toBe(30_000)
    expect(r.cuadrado).toBe(false)
  })
})
