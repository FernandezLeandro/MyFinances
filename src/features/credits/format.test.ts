import { describe, expect, it } from 'vitest'
import { etiquetaCuota } from './format'

describe('etiquetaCuota', () => {
  it('una sola cuota → sin etiqueta', () => {
    expect(etiquetaCuota(1, 1)).toBe('')
  })

  it('varias cuotas → "(n/total)"', () => {
    expect(etiquetaCuota(3, 12)).toBe('(3/12)')
  })
})
