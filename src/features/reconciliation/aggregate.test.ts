import { describe, expect, it } from 'vitest'
import { reconciliar } from './aggregate'
import { makeLocation, makeReceivable } from '@/test/factories'

describe('reconciliar', () => {
  it('sin lugares ni deudas → todo en 0 y diferencia igual al saldo entero, sin romper', () => {
    const r = reconciliar([], [], 15_000_00)
    expect(r.locationsCents).toBe(0)
    expect(r.receivablesCents).toBe(0)
    expect(r.totalCents).toBe(0)
    expect(r.diffCents).toBe(-15_000_00)
    expect(r.cuadrado).toBe(false)
  })

  it('suma de lugares > saldo → diferencia positiva, falta un ingreso', () => {
    const locations = [makeLocation({ amountCents: 100_000 }), makeLocation({ amountCents: 60_000 })]
    const r = reconciliar(locations, [], 150_000)
    expect(r.totalCents).toBe(160_000)
    expect(r.diffCents).toBe(10_000)
  })

  it('suma de lugares < saldo → diferencia negativa, falta un gasto', () => {
    const locations = [makeLocation({ amountCents: 50_000 }), makeLocation({ amountCents: 20_000 })]
    const r = reconciliar(locations, [], 150_000)
    expect(r.totalCents).toBe(70_000)
    expect(r.diffCents).toBe(-80_000)
  })

  it('suma exacta → cuadrado true y diferencia 0', () => {
    const locations = [makeLocation({ amountCents: 150_000 })]
    const r = reconciliar(locations, [], 150_000)
    expect(r.diffCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('un lugar en negativo (cuenta en descubierto) resta del total', () => {
    const locations = [makeLocation({ amountCents: 100_000 }), makeLocation({ amountCents: -20_000 })]
    const r = reconciliar(locations, [], 0)
    expect(r.totalCents).toBe(80_000)
    expect(r.diffCents).toBe(80_000)
  })

  it('saldo en 0 con lugares cargados → diferencia igual al total', () => {
    const locations = [makeLocation({ amountCents: 30_000 })]
    const r = reconciliar(locations, [], 0)
    expect(r.diffCents).toBe(30_000)
    expect(r.cuadrado).toBe(false)
  })

  it('una deuda sola, sin lugares → suma igual que un lugar, no rompe', () => {
    const receivables = [makeReceivable({ amountCents: 10_000_00 })]
    const r = reconciliar([], receivables, 0)
    expect(r.locationsCents).toBe(0)
    expect(r.receivablesCents).toBe(10_000_00)
    expect(r.totalCents).toBe(10_000_00)
    expect(r.diffCents).toBe(10_000_00)
  })

  it('prestaste $10.000 que ya no está en ningún lugar → la deuda cierra el cuadre exacto', () => {
    // El saldo de la app sigue contando esos $10.000 (no hubo gasto real), así que sin la deuda
    // cargada el cuadre marcaría -$10.000 de diferencia — el caso que motiva esta función.
    const locations = [makeLocation({ amountCents: 140_000 })]
    const receivables = [makeReceivable({ amountCents: 10_000 })]
    const r = reconciliar(locations, receivables, 150_000)
    expect(r.diffCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('lugares y deudas combinados → cada suma se reporta por separado además del total', () => {
    const locations = [makeLocation({ amountCents: 50_000 }), makeLocation({ amountCents: 20_000 })]
    const receivables = [makeReceivable({ amountCents: 5_000 }), makeReceivable({ amountCents: 3_000 })]
    const r = reconciliar(locations, receivables, 70_000)
    expect(r.locationsCents).toBe(70_000)
    expect(r.receivablesCents).toBe(8_000)
    expect(r.totalCents).toBe(78_000)
    expect(r.diffCents).toBe(8_000)
  })
})
