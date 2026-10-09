import { z } from 'zod'
import { CATEGORY_COLOR_HEXES } from '@/lib/categoryColors'
import { CATEGORY_ICON_KEYS, foldText } from '@/lib/categoryIcons'

/** Tipos de categoría. Las de inversión no agrupan movimientos: sólo las usa `investments`. */
export type CategoryKindName = 'expense' | 'income' | 'investment'

/** «De gasto», «De ingreso», «De inversión» — la ficha del tipo en el editor y en las confirmaciones. */
export const CATEGORY_KIND_LABEL: Record<CategoryKindName, string> = {
  expense: 'De gasto',
  income: 'De ingreso',
  investment: 'De inversión',
}

/** Pestañas de `/categorias`: las activas por tipo, y todas las archivadas juntas. */
export type CategoryTab = CategoryKindName | 'archived'

interface ListableCategory {
  name: string
  kind: CategoryKindName
  is_archived: boolean
}

function inTab(c: ListableCategory, tab: CategoryTab): boolean {
  return tab === 'archived' ? c.is_archived : !c.is_archived && c.kind === tab
}

/** Las de la pestaña que matchean el buscador (sin tildes ni mayúsculas), por nombre. */
export function filterCategories<T extends ListableCategory>(categories: readonly T[], tab: CategoryTab, query: string): T[] {
  const q = foldText(query)
  return categories
    .filter((c) => inTab(c, tab) && (!q || foldText(c.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Cantidad de categorías por pestaña — lo que muestra el segmentado. Sin mirar el buscador. */
export function tabCounts(categories: readonly ListableCategory[]): Record<CategoryTab, number> {
  const counts = { expense: 0, income: 0, investment: 0, archived: 0 }
  for (const c of categories) {
    if (c.is_archived) counts.archived++
    else counts[c.kind]++
  }
  return counts
}

/** Lo que guarda el editor. La base valida lo mismo (`categories_color_palette`, `categories_icon_set`). */
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre'),
  color: z.enum(CATEGORY_COLOR_HEXES),
  icon: z.enum(CATEGORY_ICON_KEYS),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
