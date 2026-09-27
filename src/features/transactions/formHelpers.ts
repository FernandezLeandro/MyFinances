import { format, parseISO, subDays } from 'date-fns'
import { foldText } from '@/lib/categoryIcons'
import type { Category, CategoryUsage } from '@/features/categories/api'

/**
 * Las más usadas para la grilla de categoría del formulario (Bloque 3 del rediseño de modales): las
 * `n` con más uso (`usage.total`, cualquier origen — movimiento, fijo o compra en cuotas), empate
 * por nombre A–Z. Si `selectedId` no cae entre esas `n`, reemplaza la última — así la categoría ya
 * elegida (al editar, o archivada) siempre se ve marcada en la grilla en vez de perderse en "Todas".
 * `categories` ya viene filtrada por tipo y por archivada/activa (mismo criterio que
 * `categoriesForType` en `TransactionFormDialog`).
 */
export function topCategories(
  categories: Category[],
  usage: Map<string, CategoryUsage> | undefined,
  selectedId: string,
  n = 7,
): Category[] {
  const sorted = [...categories].sort((a, b) => {
    const diff = (usage?.get(b.id)?.total ?? 0) - (usage?.get(a.id)?.total ?? 0)
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'es')
  })
  const top = sorted.slice(0, n)
  if (!selectedId || top.some((c) => c.id === selectedId)) return top
  const selected = categories.find((c) => c.id === selectedId)
  if (!selected) return top
  return [...top.slice(0, n - 1), selected]
}

/** Filtro del buscador de "Todas las categorías" (desktop) y del desplegable (mobile). */
export function filterCategories(categories: Category[], query: string): Category[] {
  const q = foldText(query)
  if (!q) return categories
  return categories.filter((c) => foldText(c.name).includes(q))
}

export type DateShortcut = 'today' | 'yesterday' | 'other'

/** Qué atajo de fecha corresponde a `occurredOn` — para que la pill de Hoy/Ayer se vea marcada al
 *  editar un movimiento que ya tenía esa fecha, no sólo al elegirla desde el formulario. */
export function dateShortcut(occurredOn: string, todayISO: string): DateShortcut {
  if (occurredOn === todayISO) return 'today'
  const yesterdayISO = format(subDays(parseISO(todayISO), 1), 'yyyy-MM-dd')
  if (occurredOn === yesterdayISO) return 'yesterday'
  return 'other'
}
