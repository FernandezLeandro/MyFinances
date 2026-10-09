import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, parseStoredFilters } from './filters'

describe('parseStoredFilters', () => {
  it('lee lo guardado', () => {
    expect(parseStoredFilters('{"granularity":"year","categoryIds":["a","b"]}')).toEqual({ granularity: 'year', categoryIds: ['a', 'b'] })
  })

  it('sin nada guardado, o con basura, vuelve al default', () => {
    expect(parseStoredFilters(null)).toEqual(DEFAULT_FILTERS)
    expect(parseStoredFilters('no es json')).toEqual(DEFAULT_FILTERS)
    expect(parseStoredFilters('5')).toEqual(DEFAULT_FILTERS)
  })

  it('un campo inválido cae al default sin tirar el otro', () => {
    expect(parseStoredFilters('{"granularity":"decada","categoryIds":["a",3]}')).toEqual({ granularity: DEFAULT_FILTERS.granularity, categoryIds: ['a'] })
  })
})
