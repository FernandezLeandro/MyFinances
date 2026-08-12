import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import type { Category } from '@/features/categories/api'
import type { TransactionType } from '@/features/transactions/api'
import {
  MOVEMENT_PERIOD_PRESETS,
  MOVEMENT_PERIOD_PRESET_LABELS,
  type MovementPeriod,
  type MovementPeriodPreset,
} from '@/features/transactions/movementPeriod'

export interface MovementFilters {
  period: MovementPeriod
  type: 'all' | TransactionType
  categoryIds: string[]
}

interface TransactionFiltersDialogProps {
  open: boolean
  onClose: () => void
  value: MovementFilters
  onApply: (next: MovementFilters) => void
  categories: Category[]
}

type FilterView = 'filters' | 'categories'

export function TransactionFiltersDialog({
  open,
  onClose,
  value,
  onApply,
  categories,
}: TransactionFiltersDialogProps) {
  const [draft, setDraft] = useState(value)
  const [view, setView] = useState<FilterView>('filters')
  const [categorySearch, setCategorySearch] = useState('')

  // El panel edita un borrador propio y sólo lo publica en "Aplicar" — así elegir varias
  // categorías no dispara una query a Supabase por cada click. Se resincroniza cada vez que abre.
  useEffect(() => {
    if (open) {
      setDraft(value)
      setView('filters')
      setCategorySearch('')
    }
  }, [open, value])

  const customInvalid =
    draft.period.preset === 'custom' && (!draft.period.from || !draft.period.to || draft.period.from > draft.period.to)

  function selectPreset(preset: MovementPeriodPreset) {
    setDraft((d) => ({ ...d, period: { ...d.period, preset } }))
  }

  function selectType(type: 'all' | TransactionType) {
    if (type === draft.type) return
    setDraft((d) => ({
      ...d,
      type,
      // Las categorías elegidas que ya no correspondan al tipo nuevo dejan de tener sentido.
      categoryIds:
        type === 'all'
          ? d.categoryIds
          : d.categoryIds.filter((id) => categories.find((c) => c.id === id)?.kind === type),
    }))
  }

  function toggleCategory(id: string) {
    setDraft((d) => ({
      ...d,
      categoryIds: d.categoryIds.includes(id) ? d.categoryIds.filter((c) => c !== id) : [...d.categoryIds, id],
    }))
  }

  function clearDraft() {
    setDraft({ period: { ...draft.period, preset: 'month' }, type: 'all', categoryIds: [] })
  }

  function clearCategories() {
    setDraft((d) => ({ ...d, categoryIds: [] }))
  }

  function apply() {
    if (customInvalid) return
    onApply(draft)
    onClose()
  }

  function openCategories() {
    setCategorySearch('')
    setView('categories')
  }

  const selectedIds = new Set(draft.categoryIds)
  // Conserva visibles las categorías archivadas ya elegidas (pueden llegar desde el drill-down de
  // Análisis) — si no, quedaría un filtro activo que el panel no puede mostrar ni sacar.
  const visibleCategories = categories.filter((c) => !c.is_archived || selectedIds.has(c.id))

  const term = categorySearch.trim().toLowerCase()
  function categoriesFor(kind: 'income' | 'expense') {
    return visibleCategories.filter((c) => c.kind === kind && (term === '' || c.name.toLowerCase().includes(term)))
  }

  const categorySummaryLabel =
    draft.categoryIds.length === 0
      ? 'Todas las categorías'
      : draft.categoryIds.length === 1
        ? (categories.find((c) => c.id === draft.categoryIds[0])?.name ?? '1 seleccionada')
        : `${draft.categoryIds.length} seleccionadas`

  const groups: { title?: string; items: Category[] }[] =
    draft.type === 'all'
      ? [
          { title: 'Gastos', items: categoriesFor('expense') },
          { title: 'Ingresos', items: categoriesFor('income') },
        ]
      : [{ items: categoriesFor(draft.type) }]
  const noResults = groups.every((g) => g.items.length === 0)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={view === 'categories' ? 'Categorías' : 'Filtros'}
      footer={
        view === 'filters' ? (
          <>
            <Button variant="ghost" onClick={clearDraft} className="mr-auto">
              Limpiar
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={apply} disabled={customInvalid}>
              Aplicar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={clearCategories} className="mr-auto">
              Limpiar
            </Button>
            <Button onClick={() => setView('filters')}>Listo</Button>
          </>
        )
      }
    >
      {view === 'filters' ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Período</p>
            <Select value={draft.period.preset} onChange={(e) => selectPreset(e.target.value as MovementPeriodPreset)}>
              {MOVEMENT_PERIOD_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {MOVEMENT_PERIOD_PRESET_LABELS[preset]}
                </option>
              ))}
            </Select>
            {draft.period.preset === 'custom' && (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="date"
                  value={draft.period.from}
                  onChange={(e) => setDraft((d) => ({ ...d, period: { ...d.period, from: e.target.value } }))}
                  className="h-9 text-[13px]"
                />
                <span aria-hidden className="text-chalk-faint">
                  –
                </span>
                <Input
                  type="date"
                  value={draft.period.to}
                  onChange={(e) => setDraft((d) => ({ ...d, period: { ...d.period, to: e.target.value } }))}
                  className="h-9 text-[13px]"
                />
              </div>
            )}
            {customInvalid && <p className="text-[12px] text-coral">Elegí un rango de fechas válido.</p>}
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">Tipo</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={draft.type === 'all'} onClick={() => selectType('all')}>
                Todos
              </Chip>
              <Chip active={draft.type === 'income'} onClick={() => selectType('income')}>
                Ingresos
              </Chip>
              <Chip active={draft.type === 'expense'} onClick={() => selectType('expense')}>
                Gastos
              </Chip>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">Categorías</p>
            <button
              type="button"
              onClick={openCategories}
              className="flex h-11 items-center justify-between gap-3 rounded-control bg-ink-850 px-3.5 text-[15px] text-chalk transition-colors duration-150 hover:bg-ink-800"
            >
              <span className="truncate">{categorySummaryLabel}</span>
              <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0 text-chalk-faint">
                <path d="M4.5 2.5 8.5 6l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setView('filters')}
            className="flex w-fit items-center gap-1 text-[13px] text-chalk-faint transition-colors duration-150 hover:text-chalk"
          >
            <svg aria-hidden viewBox="0 0 12 12" className="size-3">
              <path d="M7.5 2.5 3.5 6l4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver
          </button>

          <Input
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Buscar categoría…"
            className="h-10 text-[14px]"
          />

          <div className="flex max-h-72 flex-col gap-4 overflow-y-auto">
            {noResults ? (
              <p className="px-1 py-2 text-[13px] text-chalk-faint">
                {term ? `Sin resultados para "${categorySearch.trim()}".` : 'No hay categorías para este tipo.'}
              </p>
            ) : (
              groups.map((group, i) => {
                if (group.items.length === 0) return null
                return (
                  <div key={group.title ?? i} className="flex flex-col gap-1">
                    {group.title && <p className="eyebrow px-1">{group.title}</p>}
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((category) => {
                        const active = selectedIds.has(category.id)
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => toggleCategory(category.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-control px-3.5 py-2.5 text-left text-[14px] transition-colors duration-150',
                              active ? 'bg-ink-800 text-chalk' : 'text-chalk-dim hover:bg-ink-850',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                              <span className="truncate">{category.name}</span>
                            </span>
                            {active && (
                              <svg aria-hidden viewBox="0 0 12 12" className="size-3.5 shrink-0 text-acid">
                                <path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
