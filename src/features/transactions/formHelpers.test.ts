import { describe, expect, it } from 'vitest'
import type { Category, CategoryUsage } from '@/features/categories/api'
import { dateShortcut, filterCategories, selectionLabel, topCategories } from './formHelpers'

function cat(id: string, name: string): Category {
  return {
    id,
    user_id: 'u1',
    name,
    kind: 'expense',
    color: '#1E88E5',
    icon: 'tag',
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function usage(map: Record<string, number>): Map<string, CategoryUsage> {
  return new Map(Object.entries(map).map(([id, total]) => [id, { transactions: total, fixedExpenses: 0, creditPurchases: 0, investments: 0, total }]))
}

describe('topCategories', () => {
  const categories = [cat('a', 'Zapatillas'), cat('b', 'Supermercado'), cat('c', 'Salidas'), cat('d', 'Transporte')]

  it('ordena por uso descendente', () => {
    const top = topCategories(categories, usage({ a: 1, b: 10, c: 5, d: 0 }), '', 3)
    expect(top.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('sin uso, desempata A–Z', () => {
    const top = topCategories(categories, undefined, '', 2)
    expect(top.map((c) => c.id)).toEqual(['c', 'b'])
  })

  it('si la elegida no entra entre las N, reemplaza la última', () => {
    const top = topCategories(categories, usage({ a: 1, b: 10, c: 5, d: 0 }), 'd', 3)
    expect(top.map((c) => c.id)).toEqual(['b', 'c', 'd'])
  })

  it('si la elegida ya está entre las N, no cambia nada', () => {
    const top = topCategories(categories, usage({ a: 1, b: 10, c: 5, d: 0 }), 'b', 3)
    expect(top.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('filterCategories', () => {
  const categories = [cat('a', 'Café y bares'), cat('b', 'Supermercado')]

  it('sin texto, devuelve todas', () => {
    expect(filterCategories(categories, '')).toHaveLength(2)
  })

  it('ignora tildes y mayúsculas', () => {
    expect(filterCategories(categories, 'cafe').map((c) => c.id)).toEqual(['a'])
    expect(filterCategories(categories, 'SUPER').map((c) => c.id)).toEqual(['b'])
  })
})

describe('dateShortcut', () => {
  const today = '2026-09-24'

  it('detecta hoy', () => {
    expect(dateShortcut(today, today)).toBe('today')
  })

  it('detecta ayer', () => {
    expect(dateShortcut('2026-09-23', today)).toBe('yesterday')
  })

  it('cualquier otra fecha es "other"', () => {
    expect(dateShortcut('2026-09-01', today)).toBe('other')
  })

  it('ayer cruzando de mes', () => {
    expect(dateShortcut('2026-08-31', '2026-09-01')).toBe('yesterday')
  })
})

describe('selectionLabel', () => {
  it('sin nada elegido dice que no filtra', () => {
    expect(selectionLabel([], 'Todas las cuentas', 'cuentas')).toBe('Todas las cuentas')
  })

  it('con una sola muestra su nombre', () => {
    expect(selectionLabel(['Galicia'], 'Todas las cuentas', 'cuentas')).toBe('Galicia')
  })

  it('desde dos muestra la cantidad', () => {
    expect(selectionLabel(['Hogar', 'Súper', 'Salud'], 'Todas las categorías', 'categorías')).toBe('3 categorías')
  })
})
