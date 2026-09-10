/**
 * Corta una lista larga en "los primeros N" + "el resto agrupado" — un donut de categorías, un
 * catálogo de activos, cualquier lista que crezca con el uso y necesite un tope legible. Función
 * pura y genérica a propósito: la usa Análisis (categorías) y la va a usar Ahorros (activos), y
 * ninguna de las dos features debería depender de la otra para esto.
 */
export interface SplitTopN<T> {
  top: T[]
  /** Vacío si no hace falta cortar — ver la regla de `n + 1` abajo. */
  rest: T[]
  restCents: number
}

/**
 * `items` ya tiene que venir ordenado de mayor a menor `cents` — acá no se reordena, sólo se corta.
 * Si `items.length <= n + 1`, `rest` queda vacío: no vale la pena un "Otros 1" que ahorra una sola
 * fila y esconde el dato en vez de mostrarlo.
 */
export function splitTopN<T extends { cents: number }>(items: T[], n: number): SplitTopN<T> {
  if (items.length <= n + 1) {
    return { top: items, rest: [], restCents: 0 }
  }
  const top = items.slice(0, n)
  const rest = items.slice(n)
  return { top, rest, restCents: rest.reduce((sum, item) => sum + item.cents, 0) }
}
