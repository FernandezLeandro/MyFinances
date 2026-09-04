import { describe, expect, it } from 'vitest'
import { reconciliar } from './aggregate'
import { particionarPorHorizonte } from '@/features/receivables/aggregate'
import { makeLocation, makeReceivableSummary } from '@/test/factories'

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
    const receivables = [makeReceivableSummary({ pendingCents: 10_000_00 })]
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
    const receivables = [makeReceivableSummary({ pendingCents: 10_000 })]
    const r = reconciliar(locations, receivables, 150_000)
    expect(r.diffCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('lugares y deudas combinados → cada suma se reporta por separado además del total', () => {
    const locations = [makeLocation({ amountCents: 50_000 }), makeLocation({ amountCents: 20_000 })]
    const receivables = [makeReceivableSummary({ pendingCents: 5_000 }), makeReceivableSummary({ pendingCents: 3_000 })]
    const r = reconciliar(locations, receivables, 70_000)
    expect(r.locationsCents).toBe(70_000)
    expect(r.receivablesCents).toBe(8_000)
    expect(r.totalCents).toBe(78_000)
    expect(r.diffCents).toBe(8_000)
  })

  it('deuda con already_expensed no suma en el cuadre, pero se reporta en expensedPendingCents', () => {
    const receivables = [makeReceivableSummary({ pendingCents: 10_000_00, alreadyExpensed: true })]
    const r = reconciliar([], receivables, 0)
    expect(r.receivablesCents).toBe(0)
    expect(r.expensedPendingCents).toBe(10_000_00)
    expect(r.totalCents).toBe(0)
  })

  it('mezcla de flags → sólo la que no está ya gastada entra en totalCents', () => {
    const locations = [makeLocation({ amountCents: 100_000 })]
    const receivables = [
      makeReceivableSummary({ pendingCents: 20_000, alreadyExpensed: false }),
      makeReceivableSummary({ pendingCents: 30_000, alreadyExpensed: true }),
    ]
    const r = reconciliar(locations, receivables, 120_000)
    expect(r.receivablesCents).toBe(20_000)
    expect(r.expensedPendingCents).toBe(30_000)
    expect(r.totalCents).toBe(120_000)
    expect(r.diffCents).toBe(0)
  })

  it('deuda con abono parcial suma sólo lo pendiente, no el total original', () => {
    const receivables = [makeReceivableSummary({ pendingCents: 30_000 })]
    const r = reconciliar([], receivables, 30_000)
    expect(r.receivablesCents).toBe(30_000)
    expect(r.cuadrado).toBe(true)
  })

  it('deuda ya cobrada no suma en ningún campo', () => {
    const receivables = [makeReceivableSummary({ pendingCents: 0, cobrada: true })]
    const r = reconciliar([], receivables, 0)
    expect(r.receivablesCents).toBe(0)
    expect(r.expensedPendingCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('caso doctrinal: pagaste $10.000 con débito por un tercero y cargaste el gasto → el cuadre da 0 sin sumar la deuda', () => {
    // Si `receivablesCents` sumara acá, el cuadre marcaría +$10.000 de excedente falso — la plata
    // ya salió del saldo cuando se cargó el gasto, no está en ningún lado más.
    const locations = [makeLocation({ amountCents: 140_000 })]
    const receivables = [makeReceivableSummary({ pendingCents: 10_000, alreadyExpensed: true })]
    const r = reconciliar(locations, receivables, 140_000)
    expect(r.diffCents).toBe(0)
    expect(r.cuadrado).toBe(true)
  })

  it('expensedPendingCents nunca afecta diffCents', () => {
    const locations = [makeLocation({ amountCents: 50_000 })]
    const a = reconciliar(locations, [], 50_000)
    const b = reconciliar(locations, [makeReceivableSummary({ pendingCents: 999_999, alreadyExpensed: true })], 50_000)
    expect(a.diffCents).toBe(b.diffCents)
    expect(b.diffCents).toBe(0)
  })

  it('particionarPorHorizonte (Cuadrar Saldo) es sólo presentación: no cambia receivablesCents ni diffCents', () => {
    // "Otras" arranca colapsada en el diálogo, pero sigue sumando en el cuadre — si no fuera así,
    // esconder una deuda de la vista fabricaría un faltante falso. Esta prueba es la garantía de que
    // partir la lista para mostrarla en dos grupos no le resta nada a la suma real.
    const receivables = [
      makeReceivableSummary({ pendingCents: 12_000, receivable: { expected_period: '2026-09-01' } }),
      makeReceivableSummary({ pendingCents: 30_000, receivable: { expected_period: null } }),
    ]
    const withoutSplit = reconciliar([], receivables, 0)

    const { esteMes, masAdelante } = particionarPorHorizonte(receivables, new Date('2026-09-15T12:00:00'))
    const withSplit = reconciliar([], [...esteMes, ...masAdelante], 0)

    expect(withSplit.receivablesCents).toBe(withoutSplit.receivablesCents)
    expect(withSplit.diffCents).toBe(withoutSplit.diffCents)
    expect(withoutSplit.receivablesCents).toBe(42_000)
  })
})
