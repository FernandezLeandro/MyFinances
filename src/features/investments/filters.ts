import { useState } from 'react'
import { GRANULARITIES, type Granularity } from './period'

/** Lo que se recuerda entre visitas, en este navegador. El ancla del período no: cada visita arranca
 *  en el período actual. */
export interface InvestmentFilters {
  granularity: Granularity
  /** Vacío = todas las categorías. */
  categoryIds: string[]
}

const STORAGE_KEY = 'inversiones:filtros'

export const DEFAULT_FILTERS: InvestmentFilters = { granularity: 'month', categoryIds: [] }

/** Lo guardado puede estar viejo, mal formado o de otra versión: se valida campo por campo y lo
 *  inválido cae al default, nunca rompe la pantalla. */
export function parseStoredFilters(raw: string | null): InvestmentFilters {
  if (!raw) return DEFAULT_FILTERS
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_FILTERS
    const { granularity, categoryIds } = value as Record<string, unknown>
    return {
      granularity: GRANULARITIES.includes(granularity as Granularity) ? (granularity as Granularity) : DEFAULT_FILTERS.granularity,
      categoryIds: Array.isArray(categoryIds) ? categoryIds.filter((id): id is string => typeof id === 'string') : [],
    }
  } catch {
    return DEFAULT_FILTERS
  }
}

function read(): InvestmentFilters {
  try {
    return parseStoredFilters(localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_FILTERS
  }
}

/** Filtros de Inversiones, recordados en este navegador (`localStorage`) — mismo patrón que
 *  `usePageSize` de Movimientos. */
export function useInvestmentFilters(): [InvestmentFilters, (next: InvestmentFilters) => void] {
  const [filters, setFiltersState] = useState<InvestmentFilters>(read)

  function setFilters(next: InvestmentFilters) {
    setFiltersState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage bloqueado (privado, cuota): la preferencia no persiste esta sesión.
    }
  }

  return [filters, setFilters]
}
