import type { NeutralChip } from '@/lib/categoryIcons'

/** Lo que necesita `CategoryChip` para pintarse — el color/ícono de una categoría real, o una de
 *  las cuatro fichas neutras grises (P3/P4 del diseño de "categorías en el resto de la app"). */
export type ChipLook = { color: string; icon: string | null | undefined } | { neutral: NeutralChip }

/**
 * Decide qué ficha pinta una fila. `category` puede faltar por dos motivos que se tratan igual: no
 * hay categoría asignada (`category_id` null) o el id no está en el mapa cargado (grupo "Sin
 * categoría" de una RPC, que llega con `color: null` en vez de con id ausente) — las dos caen en la
 * ficha neutra `uncategorized`.
 *
 * `adjustment` gana aunque la fila tenga una categoría cargada — un ajuste de saldo no es un gasto
 * de esa categoría (`movementCategoryLabel` en `transactions/aggregate.ts` trata el mismo caso).
 *
 * No mira `is_archived`: por diseño (P9), un movimiento viejo de una categoría archivada sigue
 * mostrando su color e ícono de siempre, no la ficha gris de archivada.
 */
export function chipLook(category: { color: string | null; icon?: string | null } | undefined, opts?: { adjustment?: boolean }): ChipLook {
  if (opts?.adjustment) return { neutral: 'adjustment' }
  if (!category || category.color == null) return { neutral: 'uncategorized' }
  return { color: category.color, icon: category.icon }
}
