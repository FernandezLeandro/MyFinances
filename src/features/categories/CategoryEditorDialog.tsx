import { useState } from 'react'
import { Archive, Check, Lock } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { SearchInput } from '@/components/ui/SearchInput'
import { CATEGORY_COLORS, CATEGORY_PALETTE, onColor } from '@/lib/categoryColors'
import { CATEGORY_ICONS, DEFAULT_CATEGORY_ICON, categoryIcon, firstRow, searchIcons, type CategoryIconDef } from '@/lib/categoryIcons'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { CategoryChip } from './CategoryChip'
import { CATEGORY_KIND_LABEL, categoryInputSchema, type CategoryInput, type CategoryKindName } from './list'

interface EditableCategory {
  name: string
  color: string
  icon: string
  is_archived: boolean
}

interface CategoryEditorDialogProps {
  open: boolean
  onClose: () => void
  kind: CategoryKindName
  /** Sin categoría es un alta. Montar con `key` por categoría: el borrador sale de acá una sola vez. */
  category?: EditableCategory
  saving: boolean
  onSave: (input: CategoryInput) => void
  /** Sólo al editar una activa. */
  onArchive?: () => void
  /** Sólo al editar una archivada. */
  onReactivate?: () => void
  /** Sólo al editar una archivada — eliminar se ofrece recién después de archivar. */
  onDelete?: () => void
}

const HEXES: string[] = CATEGORY_COLORS.map((c) => c.hex)
const colorName = new Map<string, string>(CATEGORY_COLORS.map((c) => [c.hex, c.name]))

function Swatch({ hex, selected, onPick, size }: { hex: string; selected: boolean; onPick: () => void; size: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={colorName.get(hex)}
      onClick={onPick}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-shadow duration-150',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-9',
        size === 'lg' && 'size-10',
        // Elegido: anillo doble (hueco de superficie + tinta), se lee igual sobre un color parecido.
        selected ? 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-fg)]' : 'ring-1 ring-fg/10 ring-inset',
      )}
      style={{ backgroundColor: hex, color: onColor(hex) }}
    >
      {selected && <Check className="size-4" strokeWidth={2.5} aria-hidden />}
    </button>
  )
}

function IconOption({ def, selected, color, onPick, tall }: { def: CategoryIconDef; selected: boolean; color: string; onPick: () => void; tall?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={def.label}
      onClick={onPick}
      className={cn(
        'grid place-items-center rounded-[13px] transition-colors duration-150',
        tall ? 'h-12' : 'h-11',
        selected ? 'ring-1 ring-fg/10 ring-inset' : 'bg-fill-subtle text-fg-secondary hover:text-fg',
      )}
      style={selected ? { backgroundColor: color, color: onColor(color) } : undefined}
    >
      <def.Icon className="size-5" strokeWidth={2} aria-hidden />
    </button>
  )
}

const moreClass =
  'grid place-items-center border-[1.5px] border-dashed border-border-strong bg-transparent text-[12px] font-bold text-fg-secondary'

/**
 * Editor de categoría — alta y edición en el mismo modal (Editor 2 v2 del rediseño de
 * `/categorias`). Lo usan `/categorias` y el catálogo de admin.
 *
 * El tipo no se elige acá (HO-15): viene de la pestaña desde la que se creó y queda fijo — el
 * candado del encabezado lo dice. Color e ícono salen de sets cerrados (40 y 35) que la base
 * también valida.
 *
 * En desktop muestra las dos grillas completas. En mobile (bottom sheet) sólo una primera fila de
 * cada una más un «+» que abre un segundo sheet con todas; lo elegido siempre queda a la vista en
 * esa primera fila (`firstRow`). Es contenido distinto por breakpoint, no sólo acomodo: por eso
 * `useMediaQuery` y no clases responsive.
 */
export function CategoryEditorDialog({
  open,
  onClose,
  kind,
  category,
  saving,
  onSave,
  onArchive,
  onReactivate,
  onDelete,
}: CategoryEditorDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 640px)')
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category && HEXES.includes(category.color) ? category.color : HEXES[0])
  const [icon, setIcon] = useState(category?.icon ?? DEFAULT_CATEGORY_ICON)
  const [sheet, setSheet] = useState<'color' | 'icon' | null>(null)
  const [iconQuery, setIconQuery] = useState('')

  const isNew = !category
  const archived = !!category?.is_archived
  const canSave = !!name.trim() && !saving

  function save() {
    const parsed = categoryInputSchema.safeParse({ name, color, icon })
    if (parsed.success) onSave(parsed.data)
  }

  function pickFromSheet(apply: () => void) {
    apply()
    setSheet(null)
    setIconQuery('')
  }

  const kindLabel = CATEGORY_KIND_LABEL[kind]
  const saveButton = (
    <Button size="dialogFooter" onClick={save} disabled={!canSave} loading={saving}>
      {isNew ? 'Crear categoría' : 'Guardar'}
    </Button>
  )
  // Pie v2 (`DialogFooterBar`): Archivar/Eliminar a la izquierda, Cancelar/Reactivar y la acción a la
  // derecha. En mobile el pie apila solo: acción arriba, Cancelar/Reactivar y, al fondo, Archivar.
  const sideAction = archived ? (
    onDelete && (
      <Button variant="ghost" size="dialogFooter" onClick={onDelete} className="text-negative! hover:text-negative!">
        Eliminar
      </Button>
    )
  ) : (
    onArchive && (
      <Button variant="ghost" size="dialogFooter" onClick={onArchive} className="text-fg-secondary! hover:text-fg!">
        <Archive className="size-4" aria-hidden />
        Archivar
      </Button>
    )
  )
  const dismissLabel = archived && onReactivate ? 'Reactivar' : 'Cancelar'
  const dismissAction = archived && onReactivate ? onReactivate : onClose
  const footer = (
    <DialogFooterBar start={sideAction || undefined}>
      <Button variant="outline" size="dialogFooter" onClick={dismissAction} className="max-sm:hidden">
        {dismissLabel}
      </Button>
      <Button variant="ghost" size="dialogFooter" onClick={dismissAction} className="sm:hidden">
        {dismissLabel}
      </Button>
      {saveButton}
    </DialogFooterBar>
  )

  const iconRow = firstRow<CategoryIconDef>(CATEGORY_ICONS, categoryIcon(icon), 5)
  const iconResults = searchIcons(iconQuery)

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="lg"
        ownsPending
        footerBleed
        title={isNew ? 'Nueva categoría' : archived ? 'Categoría archivada' : 'Editar categoría'}
        subtitle={
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden />
            {kindLabel} · {isNew ? 'después no se cambia' : 'el tipo no se cambia'}
          </span>
        }
        footer={footer}
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="category-name" className="text-[13px] font-medium text-fg-secondary">
              Nombre
            </label>
            <div className="flex items-center gap-2.5">
              <CategoryChip color={color} icon={icon} size={48} />
              <input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) save()
                }}
                placeholder="Mascotas, Regalos…"
                autoFocus={isNew}
                className="h-12 min-w-0 flex-1 rounded-[14px] border-[1.5px] border-border-strong bg-surface px-3.5 text-[15px] font-medium text-fg outline-none transition-shadow placeholder:font-normal placeholder:text-fg-muted focus:border-accent focus:ring-4 focus:ring-accent-soft"
              />
            </div>
          </div>

          <div role="radiogroup" aria-label="Color" className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-fg-secondary">Color</span>
            {isDesktop ? (
              <div className="grid grid-cols-8 justify-items-center gap-y-2.5">
                {CATEGORY_PALETTE.flat().map((c) => (
                  <Swatch key={c.hex} hex={c.hex} selected={c.hex === color} onPick={() => setColor(c.hex)} size="sm" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 justify-items-center">
                {firstRow(HEXES, color, 6).map((hex) => (
                  <Swatch key={hex} hex={hex} selected={hex === color} onPick={() => setColor(hex)} size="lg" />
                ))}
                <button type="button" onClick={() => setSheet('color')} aria-label="Ver los 40 colores" className={cn(moreClass, 'size-10 rounded-full text-[11.5px]')}>
                  +{HEXES.length - 6}
                </button>
              </div>
            )}
          </div>

          <div role="radiogroup" aria-label="Ícono" className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-fg-secondary">Ícono</span>
            {isDesktop ? (
              <div className="grid grid-cols-10 gap-1.5">
                {CATEGORY_ICONS.map((def) => (
                  <IconOption key={def.key} def={def} selected={def.key === icon} color={color} onPick={() => setIcon(def.key)} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {iconRow.map((def) => (
                  <IconOption key={def.key} def={def} selected={def.key === icon} color={color} onPick={() => setIcon(def.key)} tall />
                ))}
                <button type="button" onClick={() => setSheet('icon')} aria-label="Ver todos los íconos" className={cn(moreClass, 'h-12 rounded-[13px]')}>
                  +{CATEGORY_ICONS.length - 5}
                </button>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {!isDesktop && (
        <Dialog
          open={sheet !== null}
          onClose={() => pickFromSheet(() => {})}
          ownsPending
          title={sheet === 'color' ? 'Color' : 'Ícono'}
          subtitle="Tocá uno para elegirlo"
        >
          {sheet === 'color' && (
            <div role="radiogroup" aria-label="Todos los colores" className="grid grid-cols-8 justify-items-center gap-y-3 pb-2">
              {HEXES.map((hex) => (
                <Swatch key={hex} hex={hex} selected={hex === color} onPick={() => pickFromSheet(() => setColor(hex))} size="md" />
              ))}
            </div>
          )}
          {sheet === 'icon' && (
            <div className="flex flex-col gap-4 pb-2">
              <SearchInput
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Buscar ícono (auto, comida…)"
                aria-label="Buscar ícono"
              />
              <div role="radiogroup" aria-label="Todos los íconos" className="grid grid-cols-6 gap-2">
                {iconResults.map((def) => (
                  <IconOption key={def.key} def={def} selected={def.key === icon} color={color} onPick={() => pickFromSheet(() => setIcon(def.key))} tall />
                ))}
              </div>
              {iconResults.length === 0 && <p className="text-center text-[13px] text-fg-muted">Ningún ícono con ese nombre</p>}
            </div>
          )}
        </Dialog>
      )}
    </>
  )
}
