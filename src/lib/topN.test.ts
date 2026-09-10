import { describe, expect, it } from 'vitest'
import { splitTopN } from './topN'

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
