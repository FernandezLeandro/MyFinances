import { describe, expect, it } from 'vitest'
import { parseDollarQuotes } from './quotes'

const ROWS = [
  { moneda: 'USD', casa: 'oficial', compra: 1355, venta: 1405, fechaActualizacion: '2026-10-07T15:00:00.000Z' },
  { moneda: 'USD', casa: 'blue', compra: 1535, venta: 1555, fechaActualizacion: '2026-10-07T15:01:00.000Z' },
  { moneda: 'USD', casa: 'contadoconliqui', compra: 1500.5, venta: 1520.25, fechaActualizacion: '2026-10-07T15:02:00.000Z' },
  { moneda: 'USD', casa: 'mayorista', compra: 1340, venta: 1350, fechaActualizacion: '2026-10-07T15:03:00.000Z' },
]

describe('parseDollarQuotes', () => {
  it('trae compra y venta en centavos, incluido CCL', () => {
    const quotes = parseDollarQuotes(ROWS)
    expect(quotes.get('blue')).toEqual({ buyCents: 153500, sellCents: 155500, updatedAt: '2026-10-07T15:01:00.000Z' })
    expect(quotes.get('contadoconliqui')).toMatchObject({ buyCents: 150050, sellCents: 152025 })
  })

  it('ignora las casas que la app no usa', () => {
    expect(parseDollarQuotes(ROWS).has('mayorista' as never)).toBe(false)
  })

  it('salta las filas mal formadas sin romper las demás', () => {
    const quotes = parseDollarQuotes([
      null,
      { casa: 'bolsa', compra: null, venta: 1400 },
      { casa: 'cripto', compra: 1450, venta: 1460, fechaActualizacion: 5 },
      ...ROWS,
    ])
    expect(quotes.has('bolsa')).toBe(false)
    expect(quotes.get('cripto')).toEqual({ buyCents: 145000, sellCents: 146000, updatedAt: null })
    expect(quotes.has('oficial')).toBe(true)
  })

  it('una respuesta que no es una lista da un mapa vacío', () => {
    expect(parseDollarQuotes({ error: 'x' }).size).toBe(0)
    expect(parseDollarQuotes(undefined).size).toBe(0)
  })
})
