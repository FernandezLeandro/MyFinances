import { describe, expect, it } from 'vitest'
import { chipLook } from './chip'

describe('chipLook', () => {
  it('con categoría, usa su color e ícono', () => {
    expect(chipLook({ color: '#1E88E5', icon: 'car' })).toEqual({ color: '#1E88E5', icon: 'car' })
  })

  it('sin categoría (undefined) cae en la ficha neutra "uncategorized"', () => {
    expect(chipLook(undefined)).toEqual({ neutral: 'uncategorized' })
  })

  it('el grupo "Sin categoría" de una RPC (color null) cae en la misma ficha neutra', () => {
    expect(chipLook({ color: null, icon: null })).toEqual({ neutral: 'uncategorized' })
  })

  it('un ajuste de saldo es siempre la ficha neutra "adjustment", aunque tenga categoría', () => {
    expect(chipLook({ color: '#1E88E5', icon: 'car' }, { adjustment: true })).toEqual({ neutral: 'adjustment' })
    expect(chipLook(undefined, { adjustment: true })).toEqual({ neutral: 'adjustment' })
  })

  it('una categoría archivada conserva su color e ícono — no hay rama para eso acá', () => {
    // `is_archived` no es parte del tipo que recibe `chipLook`: lo viejo de una archivada llega con
    // el mismo shape que cualquier categoría activa, y sigue su mismo camino (P9).
    expect(chipLook({ color: '#8A9BAE', icon: 'tag' })).toEqual({ color: '#8A9BAE', icon: 'tag' })
  })
})
