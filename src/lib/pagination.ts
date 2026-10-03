export type PageItem = number | 'gap'

/**
 * Los botones de página a mostrar: todos si son 7 o menos; si no, siempre 7 lugares — la primera,
 * la última, la actual con sus vecinas y `'gap'` («…») donde se saltean páginas. Siempre la misma
 * cantidad para que la fila no cambie de ancho (y los botones de lugar) al avanzar.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (pageCount <= 7) return range(1, pageCount)
  if (page <= 4) return [...range(1, 5), 'gap', pageCount]
  if (page >= pageCount - 3) return [1, 'gap', ...range(pageCount - 4, pageCount)]
  return [1, 'gap', page - 1, page, page + 1, 'gap', pageCount]
}
