import { Chip } from '@/components/ui/Chip'
import { ColorPicker } from '@/components/ui/ColorPicker'
import type { CategoryKind } from '@/features/categories/api'

interface CategoryRowEditorProps {
  name: string
  onNameChange: (value: string) => void
  kind: CategoryKind
  onKindChange: (kind: CategoryKind) => void
  color: string
  onColorChange: (hex: string) => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
}

/**
 * Fila-editor de una categoría: nombre, tipo y color entran en la propia fila en vez de un
 * formulario fijo aparte — un solo lugar para crear y para editar (20c). Compartida por
 * `CategoryManagerDialog` (cuenta común) y `pages/admin/Categorias.tsx` (catálogo global).
 */
export function CategoryRowEditor({
  name,
  onNameChange,
  kind,
  onKindChange,
  color,
  onColorChange,
  onCancel,
  onSave,
  saving = false,
}: CategoryRowEditorProps) {
  return (
    <div className="border-l-2 border-accent bg-editing px-[15px] py-2.5">
      <div className="flex items-center gap-2.5">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Mascotas, Regalos…"
          autoFocus
          className="h-9 min-w-0 flex-1 rounded-control border border-accent/30 bg-surface px-2.5 text-[13.5px] text-fg outline-none"
        />
        <div className="flex shrink-0 gap-1">
          <Chip active={kind === 'expense'} onClick={() => onKindChange('expense')}>
            Gasto
          </Chip>
          <Chip active={kind === 'income'} onClick={() => onKindChange('income')}>
            Ingreso
          </Chip>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <ColorPicker value={color} onChange={onColorChange} />
        <div className="ml-auto flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-7 items-center rounded-chip px-3 text-[12px] font-semibold text-fg-secondary transition-colors hover:bg-fill-subtle"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!name.trim() || saving}
            className="flex h-7 items-center rounded-chip bg-accent px-3 text-[12px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
