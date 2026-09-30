import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import type { Category, CategoryUsage } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { filterCategories, topCategories } from '@/features/transactions/formHelpers'

interface CategoryPickerProps {
  /** Ya filtradas por tipo (gasto/ingreso) y por archivada/activa — mismo criterio que
   *  `categoriesForType` en `TransactionFormDialog`. */
  categories: Category[]
  usage: Map<string, CategoryUsage> | undefined
  /** `''` es "Sin categoría". */
  value: string
  onChange: (id: string) => void
  /** `grid` (default): lista de 2 columnas en escritorio y desplegable en mobile — Nuevo movimiento.
   *  `dropdown`: sólo el desplegable, en todos los anchos — formularios donde la categoría es un campo
   *  más (Fijos), no el centro de la pantalla. */
  variant?: 'grid' | 'dropdown'
  /** Rótulo del campo. Por default «Categoría · opcional». */
  label?: ReactNode
}

/**
 * Categoría del formulario de movimiento (rediseño de modales v2): en escritorio, una lista de 2
 * columnas con las 7 más usadas y «Buscar entre todas», que abre un buscador con la lista completa; en
 * mobile, un desplegable propio con el mismo buscador (un `<select>` nativo no puede mostrar íconos).
 * Las dos presentaciones comparten la misma lista (`ListPanel`, más abajo) — sólo cambia cómo se
 * abre.
 */
export function CategoryPicker({ categories, usage, value, onChange, variant = 'grid', label }: CategoryPickerProps) {
  const [query, setQuery] = useState('')
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const desktopSectionRef = useRef<HTMLDivElement>(null)
  const desktopTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)

  const top = topCategories(categories, usage, value, 7)
  const selected = categories.find((c) => c.id === value) ?? null

  function select(id: string) {
    onChange(id)
    setQuery('')
    setDesktopOpen(false)
    setMobileOpen(false)
  }

  function closePanels() {
    setQuery('')
    setDesktopOpen(false)
    setMobileOpen(false)
  }

  return (
    <>
      {/* Escritorio: lista de 2 columnas con las 7 más usadas + «Buscar entre todas» (v2: fichas
          sobre filas blancas con borde — sobre el gris cálido de antes se leían mal) */}
      <div ref={desktopSectionRef} className={cn('relative hidden flex-col gap-2', variant === 'grid' && 'sm:flex')}>
        <span className="text-[13px] font-semibold text-fg">
          Categoría <span className="font-medium text-fg-muted">· opcional · las más usadas</span>
        </span>
        <div role="group" aria-label="Categoría" className="grid grid-cols-2 gap-1.5">
          {top.map((c) => {
            const isSelected = c.id === value
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => select(c.id)}
                className={cn(
                  'flex h-12 items-center gap-2.5 rounded-control bg-surface pr-3 pl-2.5 text-left text-[14px] text-fg',
                  isSelected ? 'border-2 border-fg font-semibold' : 'border border-border font-medium hover:border-border-strong',
                )}
              >
                <CategoryChip {...chipLook(c)} size={28} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {isSelected && <Check className="size-4 shrink-0" strokeWidth={2.6} aria-hidden />}
              </button>
            )
          })}
          <button
            ref={desktopTriggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={desktopOpen}
            onClick={() => setDesktopOpen((v) => !v)}
            className={cn(
              'flex h-12 items-center gap-2.5 rounded-control border px-3 text-[14px] font-medium',
              desktopOpen ? 'border-accent bg-accent-soft text-accent-text' : 'border-dashed border-border-strong text-fg-secondary',
            )}
          >
            <Search className="size-[17px]" strokeWidth={2} aria-hidden />
            Buscar entre todas
          </button>
        </div>
        <FloatingPanel open={desktopOpen} onClose={closePanels} triggerRef={desktopTriggerRef} anchorRef={desktopSectionRef}>
          <ListPanel categories={categories} usage={usage} value={value} query={query} onQuery={setQuery} onSelect={select} />
        </FloatingPanel>
      </div>

      {/* Mobile: desplegable propio */}
      <div className={cn('relative flex flex-col gap-2', variant === 'grid' && 'sm:hidden')}>
        <span className="text-[13px] font-semibold text-fg">
          {label ?? (
            <>
              Categoría <span className="font-medium text-fg-muted">· opcional</span>
            </>
          )}
        </span>
        <button
          ref={mobileTriggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className={cn(
            'flex h-[50px] items-center gap-2.5 rounded-control border px-3 text-left text-[14.5px] font-medium text-fg',
            mobileOpen ? 'border-accent ring-4 ring-accent-soft' : 'border-border-strong',
          )}
        >
          <CategoryChip {...chipLook(selected ?? undefined)} size={28} />
          <span className="min-w-0 flex-1 truncate">{selected?.name ?? 'Sin categoría'}</span>
          <ChevronDown className={cn('size-4 shrink-0 text-fg-muted transition-transform', mobileOpen && 'rotate-180')} aria-hidden />
        </button>
        <FloatingPanel open={mobileOpen} onClose={closePanels} triggerRef={mobileTriggerRef}>
          <ListPanel categories={categories} usage={usage} value={value} query={query} onQuery={setQuery} onSelect={select} />
        </FloatingPanel>
      </div>
    </>
  )
}

/** Lista compartida por las dos presentaciones: buscador arriba, «Más usadas» y después «Todas ·
 *  A–Z» mientras no se está buscando; filtrada y plana en cuanto hay texto. «Sin categoría» sólo
 *  aparece sin búsqueda — no tiene nombre real contra el que filtrar. */
function ListPanel({
  categories,
  usage,
  value,
  query,
  onQuery,
  onSelect,
}: {
  categories: Category[]
  usage: Map<string, CategoryUsage> | undefined
  value: string
  query: string
  onQuery: (q: string) => void
  onSelect: (id: string) => void
}) {
  const searching = query.trim().length > 0
  const filtered = filterCategories(categories, query)
  const mostUsed = searching ? [] : topCategories(categories, usage, '', 5)
  const mostUsedIds = new Set(mostUsed.map((c) => c.id))
  const rest = searching ? filtered : categories.filter((c) => !mostUsedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  // «Sin categoría» no tiene nombre real contra el que buscar — sólo aparece en la lista completa,
  // sin filtro activo (P9 del rediseño: "primera de la lista completa").
  const showUncategorized = !searching

  return (
    <div className="flex min-h-0 w-full flex-col gap-1.5 p-1">
      <div className="relative flex h-11 shrink-0 items-center gap-2 rounded-float border border-border-strong px-3 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
        <Search className="size-4 shrink-0 text-fg-muted" strokeWidth={2} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Buscar categoría"
          aria-label="Buscar categoría"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-fg outline-none placeholder:text-fg-muted"
        />
        {searching && (
          <span className="shrink-0 text-[12px] text-fg-muted">
            {filtered.length} de {categories.length}
          </span>
        )}
      </div>
      <ul role="listbox" aria-label="Categoría" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {showUncategorized && (
          <CategoryOption
            selected={value === ''}
            onClick={() => onSelect('')}
            icon={<CategoryChip {...chipLook(undefined)} size={28} />}
            name="Sin categoría"
          />
        )}
        {mostUsed.length > 0 && (
          <li aria-hidden className="px-2 pt-1.5 pb-1 text-[12px] font-semibold text-fg-secondary">
            Más usadas
          </li>
        )}
        {mostUsed.map((c) => (
          <CategoryOption
            key={c.id}
            selected={c.id === value}
            onClick={() => onSelect(c.id)}
            icon={<CategoryChip {...chipLook(c)} size={28} />}
            name={c.name}
          />
        ))}
        {!searching && rest.length > 0 && (
          <li aria-hidden className="mt-1 border-t border-border px-2 pt-2 pb-1 text-[12px] font-semibold text-fg-secondary">
            Todas · A–Z
          </li>
        )}
        {rest.map((c) => (
          <CategoryOption
            key={c.id}
            selected={c.id === value}
            onClick={() => onSelect(c.id)}
            icon={<CategoryChip {...chipLook(c)} size={28} />}
            name={c.name}
          />
        ))}
        {searching && filtered.length === 0 && (
          <li className="px-2 py-3 text-[13px] text-fg-muted">Ninguna categoría coincide</li>
        )}
      </ul>
    </div>
  )
}

function CategoryOption({
  selected,
  onClick,
  icon,
  name,
}: {
  selected: boolean
  onClick: () => void
  icon: ReactNode
  name: string
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-item px-2 text-left text-[14.5px]',
          selected ? 'bg-fill-subtle font-semibold text-fg' : 'font-medium text-fg hover:bg-fill-subtle',
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {selected && <Check className="size-4 shrink-0 text-accent-text" strokeWidth={2.4} aria-hidden />}
      </button>
    </li>
  )
}
