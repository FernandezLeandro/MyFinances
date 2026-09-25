/**
 * Trae todas las páginas de una fuente paginada, sin tope — para cuando el LIMIT del pedido (PostgREST,
 * 1000 filas por defecto) puede recortar en silencio. `fetchPage(offset, limit)` devuelve una página;
 * se sigue pidiendo hasta que una vuelva con menos filas que `pageSize` (fin de los datos).
 */
export async function fetchAllPages<T>(fetchPage: (offset: number, limit: number) => Promise<T[]>, pageSize: number): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const page = await fetchPage(offset, pageSize)
    rows.push(...page)
    if (page.length < pageSize) return rows
    offset += pageSize
  }
}
