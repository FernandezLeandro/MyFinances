import { describe, expect, it } from 'vitest'
import { splitByMinShare, splitTopN } from './topN'

const item = (cents: number) => ({ cents })

describe('splitTopN', () => {
  it('lista vacía → todo vacío, sin romper', () => {
    expect(splitTopN([], 6)).toEqual({ top: [], rest: [], restCents: 0 })
  })

  it('menos o igual que n → todo entra en top, rest vacío', () => {
    const items = [item(30), item(20), item(10)]
    const s = splitTopN(items, 6)
    expect(s.top).toEqual(items)
    expect(s.rest).toEqual([])
    expect(s.restCents).toBe(0)
  })

  it('exactamente n + 1 → no vale la pena un "Otros 1", todo entra en top', () => {
    const items = Array.from({ length: 7 }, (_, i) => item(70 - i * 10))
    const s = splitTopN(items, 6)
    expect(s.top).toHaveLength(7)
    expect(s.rest).toEqual([])
  })

  it('n + 2 → corta en n, el resto va a rest', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(80 - i * 10))
    const s = splitTopN(items, 6)
    expect(s.top).toHaveLength(6)
    expect(s.rest).toHaveLength(2)
    expect(s.top.map((i) => i.cents)).toEqual([80, 70, 60, 50, 40, 30])
    expect(s.rest.map((i) => i.cents)).toEqual([20, 10])
  })

  it('restCents suma sólo lo que quedó afuera del top', () => {
    const items = Array.from({ length: 9 }, () => item(1_000))
    const s = splitTopN(items, 6)
    expect(s.restCents).toBe(3_000) // 3 ítems fuera del top de 6
  })

  it('no reordena — asume que ya viene ordenado', () => {
    const items = [item(10), item(50), item(30)]
    const s = splitTopN(items, 1)
    expect(s.top).toEqual([item(10)])
  })
})

describe('splitByMinShare', () => {
  const cents = (items: { cents: number }[]) => items.map((i) => i.cents)

  it('lista vacía → todo vacío, sin romper', () => {
    expect(splitByMinShare([], 0.03, 2)).toEqual({ top: [], rest: [], restCents: 0 })
  })

  it('todas sobre el umbral → nada en rest', () => {
    const s = splitByMinShare([item(50), item(30), item(20)], 0.03, 1)
    expect(cents(s.top)).toEqual([50, 30, 20])
    expect(s.rest).toEqual([])
  })

  it('2+ chicas → van a rest y restCents es su suma', () => {
    // total 1000: 20 y 10 quedan bajo 3% (30)
    const s = splitByMinShare([item(600), item(370), item(20), item(10)], 0.03, 1)
    expect(cents(s.top)).toEqual([600, 370])
    expect(cents(s.rest)).toEqual([20, 10])
    expect(s.restCents).toBe(30)
  })

  it('una sola chica → no se agrupa (regla n + 1)', () => {
    const s = splitByMinShare([item(700), item(290), item(10)], 0.03, 1)
    expect(cents(s.top)).toEqual([700, 290, 10])
    expect(s.rest).toEqual([])
  })

  it('nunca corta antes de minCount aunque haya chicas antes', () => {
    // total 1000: 20, 15, 10 y 5 son chicas, pero minCount = 3 deja 20 en top
    const s = splitByMinShare([item(600), item(350), item(20), item(15), item(10), item(5)], 0.03, 3)
    expect(cents(s.top)).toEqual([600, 350, 20])
    expect(cents(s.rest)).toEqual([15, 10, 5])
  })

  it('exactamente en el umbral no se agrupa (la condición es <)', () => {
    // total 1000: 30 es justo 3%, sólo 10 y 5 quedan bajo el umbral
    const s = splitByMinShare([item(600), item(355), item(30), item(10), item(5)], 0.03, 1)
    expect(cents(s.top)).toEqual([600, 355, 30])
    expect(cents(s.rest)).toEqual([10, 5])
  })
})
