import { describe, expect, it } from 'vitest'
import { CATEGORY_ICONS, categoryIcon, firstRow, searchIcons } from './categoryIcons'

describe('CATEGORY_ICONS', () => {
  it('son exactamente las 35 keys que acepta el check de la base, en el mismo orden', () => {
    // Copia literal de `categories_icon_set` (20260926010001_categorias_icono_y_paleta.sql): si una
    // key cambia de un lado y no del otro, guardar esa categoría falla contra la base.
    const sqlKeys = [
      'shopping-cart', 'utensils', 'pizza', 'hamburger', 'car', 'bus', 'motorbike', 'plane',
      'house', 'zap', 'wifi', 'smartphone', 'heart-pulse', 'graduation-cap', 'baby', 'paw-print',
      'film', 'gamepad-2', 'dumbbell', 'volleyball', 'gift', 'shirt', 'handbag', 'credit-card',
      'receipt', 'shield', 'briefcase', 'laptop', 'banknote', 'banknote-arrow-up',
      'banknote-arrow-down', 'dollar-sign', 'piggy-bank', 'trending-up', 'tag',
    ]
    expect(CATEGORY_ICONS.map((i) => i.key)).toEqual(sqlKeys)
  })

  it('una key desconocida o vacía cae en General', () => {
    expect(categoryIcon('no-existe').key).toBe('tag')
    expect(categoryIcon(null).key).toBe('tag')
    expect(categoryIcon('pizza').label).toBe('Pizza')
  })
})

describe('searchIcons', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(searchIcons('EDUCACION').map((i) => i.key)).toEqual(['graduation-cap'])
    expect(searchIcons('dolares').map((i) => i.key)).toEqual(['dollar-sign'])
  })

  it('también busca por key, y sin texto devuelve todos', () => {
    expect(searchIcons('banknote').map((i) => i.key)).toEqual(['banknote', 'banknote-arrow-up', 'banknote-arrow-down'])
    expect(searchIcons('  ')).toHaveLength(35)
  })
})

describe('firstRow', () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

  it('lo elegido dentro de la fila la deja igual', () => {
    expect(firstRow(all, 'b', 5)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('lo elegido fuera de la fila reemplaza al último, para que siempre se vea', () => {
    expect(firstRow(all, 'g', 5)).toEqual(['a', 'b', 'c', 'd', 'g'])
  })

  it('un valor que no está en la lista no se cuela', () => {
    expect(firstRow(all, 'z', 3)).toEqual(['a', 'b', 'c'])
  })
})
