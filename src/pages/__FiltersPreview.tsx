import { useState } from 'react'
import { TransactionFiltersDialog, type MovementFilters } from '@/features/transactions/TransactionFiltersDialog'
import { defaultMovementPeriod } from '@/features/transactions/movementPeriod'
import type { Category } from '@/features/categories/api'

const MOCK_CATEGORIES: Category[] = [
  { id: '1', user_id: 'u', name: 'Comida', kind: 'expense', color: '#ff7a66', icon: null, is_archived: false, created_at: '' },
  { id: '2', user_id: 'u', name: 'Transporte', kind: 'expense', color: '#f7b955', icon: null, is_archived: false, created_at: '' },
  { id: '3', user_id: 'u', name: 'Salidas', kind: 'expense', color: '#c084fc', icon: null, is_archived: false, created_at: '' },
  { id: '4', user_id: 'u', name: 'Servicios', kind: 'expense', color: '#60a5fa', icon: null, is_archived: false, created_at: '' },
  { id: '5', user_id: 'u', name: 'Alquiler', kind: 'expense', color: '#f472b6', icon: null, is_archived: false, created_at: '' },
  { id: '6', user_id: 'u', name: 'Salud', kind: 'expense', color: '#34d399', icon: null, is_archived: false, created_at: '' },
  { id: '7', user_id: 'u', name: 'Mascotas', kind: 'expense', color: '#a3e635', icon: null, is_archived: false, created_at: '' },
  { id: '8', user_id: 'u', name: 'Regalos', kind: 'expense', color: '#fb923c', icon: null, is_archived: false, created_at: '' },
  { id: '9', user_id: 'u', name: 'Educación', kind: 'expense', color: '#38bdf8', icon: null, is_archived: false, created_at: '' },
  { id: '10', user_id: 'u', name: 'Suscripciones', kind: 'expense', color: '#e879f9', icon: null, is_archived: false, created_at: '' },
  { id: '11', user_id: 'u', name: 'Sueldo', kind: 'income', color: '#c8f751', icon: null, is_archived: false, created_at: '' },
  { id: '12', user_id: 'u', name: 'Freelance', kind: 'income', color: '#5eead4', icon: null, is_archived: false, created_at: '' },
  { id: '13', user_id: 'u', name: 'Intereses', kind: 'income', color: '#fbbf24', icon: null, is_archived: false, created_at: '' },
]

/** Página temporal para probar TransactionFiltersDialog sin backend. Borrar después de verificar. */
export function FiltersPreview() {
  const [open, setOpen] = useState(true)
  const [filters, setFilters] = useState<MovementFilters>({
    period: defaultMovementPeriod(),
    type: 'all',
    categoryIds: [],
  })

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#0b0c0f', minHeight: '100vh', color: '#fff' }}>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir filtros
      </button>
      <pre style={{ marginTop: 16, fontSize: 12 }}>{JSON.stringify(filters, null, 2)}</pre>
      <TransactionFiltersDialog
        open={open}
        onClose={() => setOpen(false)}
        value={filters}
        onApply={setFilters}
        categories={MOCK_CATEGORIES}
      />
    </div>
  )
}
