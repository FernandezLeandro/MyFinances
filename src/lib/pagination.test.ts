import { describe, expect, it } from 'vitest'
import { pageItems } from './pagination'

describe('pageItems', () => {
  it('con 7 páginas o menos las muestra todas', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(2, 3)).toEqual([1, 2, 3])
    expect(pageItems(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('al principio muestra las primeras cinco y la última', () => {
    expect(pageItems(1, 15)).toEqual([1, 2, 3, 4, 5, 'gap', 15])
    expect(pageItems(4, 15)).toEqual([1, 2, 3, 4, 5, 'gap', 15])
  })

  it('al medio muestra la actual con sus vecinas, entre la primera y la última', () => {
    expect(pageItems(5, 15)).toEqual([1, 'gap', 4, 5, 6, 'gap', 15])
    expect(pageItems(11, 15)).toEqual([1, 'gap', 10, 11, 12, 'gap', 15])
  })

  it('al final muestra la primera y las últimas cinco', () => {
    expect(pageItems(12, 15)).toEqual([1, 'gap', 11, 12, 13, 14, 15])
    expect(pageItems(15, 15)).toEqual([1, 'gap', 11, 12, 13, 14, 15])
  })

  it('siempre son 7 lugares desde 8 páginas', () => {
    for (let page = 1; page <= 8; page++) expect(pageItems(page, 8)).toHaveLength(7)
  })
})
