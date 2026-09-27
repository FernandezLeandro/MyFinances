import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useDialogPortalRoot } from '@/components/ui/dialog-portal'
import { categoryIcon } from '@/lib/categoryIcons'
import type { Category, CategoryUsage } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { filterCategories, topCategories } from '@/features/transactions/formHelpers'

/**
 * Popover del buscador de categoría. No usa `Menu` (el popover genérico de la app): ese vive dentro
 * del flujo normal del DOM y un `<select>`/menú de cuenta nunca está dentro del cuerpo scrolleable de
 * un diálogo — acá sí, y `overflow-y-auto` del cuerpo lo recortaba apenas se abría cerca del final
 * (Bloque 3 del rediseño de modales, visto en vivo en mobile). Se porta al nodo de
 * `useDialogPortalRoot` — hermano del cuerpo, sin overflow propio, todavía adentro del `<dialog>`
 * (así no pierde el "top layer" nativo) — y se posiciona a mano contra el trigger.
 */
function FloatingPanel({
  open,
  onClose,
  triggerRef,
  align,
  children,
}: {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  /** Contra qué borde del trigger alinea el popover. */
  align: 'left' | 'right'
  children: ReactNode
}) {
  const root = useDialogPortalRoot()
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  // Una sola medición al abrir, como `Menu`: un popover abierto es momentáneo, no hace falta
  // re-medir en scroll/resize.
  useLayoutEffect(() => {
    if (!open || !root) return
    const trigger = triggerRef.current
    if (!trigger) return
    const triggerBox = trigger.getBoundingClientRect()
    const rootBox = root.getBoundingClientRect()
    const width = Math.min(triggerBox.width < 280 ? 320 : triggerBox.width, rootBox.width - 16)
    let left = align === 'right' ? triggerBox.right - rootBox.left - width : triggerBox.left - rootBox.left
    left = Math.max(8, Math.min(left, rootBox.width - width - 8))
    const top = triggerBox.bottom - rootBox.top + 8
    setStyle({ top, left, width, maxHeight: rootBox.height - top - 8 })
  }, [open, root, triggerRef, align])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, triggerRef])

  if (!open || !root || !style) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'absolute', top: style.top, left: style.left, width: style.width, maxHeight: style.maxHeight }}
      className="pointer-events-auto z-10 flex animate-menu-in flex-col overflow-hidden rounded-float border border-border bg-surface shadow-lift"
    >
      {children}
    </div>,
    root,
  )
}

interface CategoryPickerProps {
  /** Ya filtradas por tipo (gasto/ingreso) y por archivada/activa — mismo criterio que
   *  `categoriesForType` en `TransactionFormDialog`. */
  categories: Category[]
  usage: Map<string, CategoryUsage> | undefined
  /** `''` es "Sin categoría". */
  value: string
  onChange: (id: string) => void
}

/**
 * Categoría del formulario de movimiento (Bloque 3 del rediseño de modales): en escritorio, una
 * grilla con las 7 más usadas y una ficha «Todas» que abre un buscador con la lista completa; en
 * mobile, un desplegable propio con el mismo buscador (un `<select>` nativo no puede mostrar íconos).
 * Las dos presentaciones comparten la misma lista (`ListPanel`, más abajo) — sólo cambia cómo se
 * abre.
 */
export function CategoryPicker({ categories, usage, value, onChange }: CategoryPickerProps) {
  const [query, setQuery] = useState('')
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
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
      {/* Escritorio: grilla 4×2 + «Todas» */}
      <div className="relative hidden flex-col gap-2 sm:flex">
        <span className="text-[13px] font-medium text-fg-secondary">
          Categoría <span className="text-fg-muted">· opcional · las 7 más usadas</span>
        </span>
        <div role="group" aria-label="Categoría" className="grid grid-cols-4 gap-2">
          {top.map((c) => {
            const isSelected = c.id === value
            const Icon = categoryIcon(c.icon).Icon
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => select(c.id)}
                className={cn(
                  'flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-control text-[12.5px]',
                  isSelected ? 'bg-inverse font-semibold text-on-inverse' : 'bg-fill-subtle font-medium text-fg',
                )}
              >
                <Icon className="size-[19px]" strokeWidth={1.8} style={isSelected ? undefined : { color: c.color }} aria-hidden />
                <span className="max-w-full truncate px-1">{c.name}</span>
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
              'flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-control border text-[12.5px] font-medium',
              desktopOpen ? 'border-accent bg-accent-soft text-accent-text' : 'border-dashed border-border-strong text-fg-secondary',
            )}
          >
            <Search className="size-[19px]" strokeWidth={1.8} aria-hidden />
            Todas
          </button>
        </div>
        <FloatingPanel open={desktopOpen} onClose={closePanels} triggerRef={desktopTriggerRef} align="right">
          <ListPanel categories={categories} usage={usage} value={value} query={query} onQuery={setQuery} onSelect={select} />
        </FloatingPanel>
      </div>

      {/* Mobile: desplegable propio */}
      <div className="relative flex flex-col gap-2 sm:hidden">
        <span className="text-[13px] font-medium text-fg-secondary">
          Categoría <span className="text-fg-muted">· opcional</span>
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
        <FloatingPanel open={mobileOpen} onClose={closePanels} triggerRef={mobileTriggerRef} align="left">
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
