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

/**
 * Igual que `splitTopN`, pero corta por peso en vez de por cantidad: a `rest` va lo que pesa menos
 * que `minShare` del total. Nunca corta antes de `minCount`, así lo que otra vista muestra como
 * top N sigue suelto acá. Misma regla `n + 1`: una sola chica no se agrupa.
 */
export function splitByMinShare<T extends { cents: number }>(items: T[], minShare: number, minCount: number): SplitTopN<T> {
  const total = items.reduce((sum, item) => sum + item.cents, 0)
  const cut = items.findIndex((item) => item.cents < total * minShare)
  return splitTopN(items, cut === -1 ? items.length : Math.max(cut, minCount))
}
