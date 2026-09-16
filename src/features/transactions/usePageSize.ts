import { useState } from 'react'

/** Opciones de tamaño de página en Movimientos, pedidas por Lean. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

const DEFAULT_PAGE_SIZE: PageSize = 50
const STORAGE_KEY = 'movimientos:pageSize'

function isPageSize(value: number): value is PageSize {
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(value)
}

function read(): PageSize {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    return isPageSize(stored) ? stored : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

/** Tamaño de página de Movimientos, recordado en este navegador (`localStorage`) entre visitas —
 *  sólo un lugar lo usa a la vez, así que no hace falta el pub-sub de `createPersistedFlag`. */
export function usePageSize(): [PageSize, (size: PageSize) => void] {
  const [pageSize, setPageSizeState] = useState<PageSize>(read)

  function setPageSize(size: PageSize) {
    setPageSizeState(size)
    try {
      localStorage.setItem(STORAGE_KEY, String(size))
    } catch {
      // Storage bloqueado (privado, cuota) — la preferencia simplemente no persiste esta sesión.
    }
  }

  return [pageSize, setPageSize]
}
