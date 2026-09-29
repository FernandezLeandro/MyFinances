import { describe, expect, it } from 'vitest'
import { categoryInputSchema, filterCategories, tabCounts } from './list'

const cats = [
  { name: 'Salud', kind: 'expense' as const, is_archived: false },
  { name: 'Educación', kind: 'expense' as const, is_archived: false },
  { name: 'Sueldo', kind: 'income' as const, is_archived: false },
  { name: 'Gimnasio', kind: 'expense' as const, is_archived: true },
  { name: 'Reintegros', kind: 'income' as const, is_archived: true },
]

describe('filterCategories', () => {
  it('cada pestaña trae sólo lo suyo, por nombre; Archivadas junta los dos tipos', () => {
    expect(filterCategories(cats, 'expense', '').map((c) => c.name)).toEqual(['Educación', 'Salud'])
    expect(filterCategories(cats, 'income', '').map((c) => c.name)).toEqual(['Sueldo'])
    expect(filterCategories(cats, 'archived', '').map((c) => c.name)).toEqual(['Gimnasio', 'Reintegros'])
  })

  it('el buscador ignora tildes y mayúsculas y no cruza de pestaña', () => {
    expect(filterCategories(cats, 'expense', 'EDUCACION').map((c) => c.name)).toEqual(['Educación'])
    expect(filterCategories(cats, 'expense', 'gim')).toEqual([])
  })
})

describe('tabCounts', () => {
  it('cuenta categorías por pestaña', () => {
    expect(tabCounts(cats)).toEqual({ expense: 2, income: 1, archived: 2 })
  })
})

describe('categoryInputSchema', () => {
  it('acepta un color y un ícono del set, y recorta el nombre', () => {
    expect(categoryInputSchema.parse({ name: '  Mascotas ', color: '#1F3A93', icon: 'paw-print' }).name).toBe('Mascotas')
  })

  it('rechaza nombre vacío, colores fuera de la paleta e íconos fuera del set', () => {
    expect(categoryInputSchema.safeParse({ name: '  ', color: '#1F3A93', icon: 'tag' }).success).toBe(false)
    expect(categoryInputSchema.safeParse({ name: 'X', color: '#C8F751', icon: 'tag' }).success).toBe(false)
    expect(categoryInputSchema.safeParse({ name: 'X', color: '#1F3A93', icon: 'rocket' }).success).toBe(false)
  })
})
