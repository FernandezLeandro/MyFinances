import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, CATEGORY_PALETTE, onColor } from './categoryColors'

describe('CATEGORY_PALETTE', () => {
  it('son 5 filas de 8, 40 hex únicos en mayúsculas', () => {
    expect(CATEGORY_PALETTE.map((row) => row.length)).toEqual([8, 8, 8, 8, 8])
    const hexes = CATEGORY_COLORS.map((c) => c.hex)
    expect(new Set(hexes).size).toBe(40)
    for (const h of hexes) expect(h).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('incluye los 14 de la paleta anterior, así ninguna categoría guardada cambia de color', () => {
    const legacy = ['#C4402A', '#C2622E', '#B8862A', '#A6874A', '#6B8F2A', '#3B8A38', '#307E59', '#1D8F7E', '#2C8396', '#2F6FB8', '#6A5BB8', '#8949A2', '#9B3B78', '#B23449']
    const hexes = new Set<string>(CATEGORY_COLORS.map((c) => c.hex))
    for (const h of legacy) expect(hexes.has(h)).toBe(true)
  })
})

describe('onColor', () => {
  it('blanco sobre los oscuros', () => {
    for (const h of ['#1F3A93', '#000000', '#7A1F3D', '#3A3A3F']) expect(onColor(h)).toBe('#ffffff')
  })

  it('tinta sobre los claros', () => {
    for (const h of ['#FFE58A', '#D0D0D5', '#FDD835', '#C5E1A5']) expect(onColor(h)).toBe('#16171b')
  })
})
