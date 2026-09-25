import { describe, expect, it } from 'vitest'
import { fetchAllPages } from './fetchAllPages'

function makeSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i)
  return async (offset: number, limit: number) => rows.slice(offset, offset + limit)
}

describe('fetchAllPages', () => {
  it('sin filas: una página vacía y listo', async () => {
    const rows = await fetchAllPages(makeSource(0), 1000)
    expect(rows).toEqual([])
  })

  it('menos que una página: no pide una segunda', async () => {
    const rows = await fetchAllPages(makeSource(400), 1000)
    expect(rows).toHaveLength(400)
  })

  // Regresión AN-10: con exactamente `pageSize` filas, una implementación ingenua puede confundir
  // "página llena" con "hay más" o con "no hay más" — acá se prueba el caso borde de las dos formas.
  it('exactamente una página: una segunda página vacía cierra el loop', async () => {
    const rows = await fetchAllPages(makeSource(1000), 1000)
    expect(rows).toHaveLength(1000)
  })

  it('varias páginas: junta todas sin cortar en el tope de la primera', async () => {
    const rows = await fetchAllPages(makeSource(2500), 1000)
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toBe(2499)
  })
})
