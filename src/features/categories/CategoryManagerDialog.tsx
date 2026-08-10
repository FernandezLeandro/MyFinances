import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Field, Input } from '@/components/ui/Input'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  type Category,
  type CategoryKind,
} from '@/features/categories/api'

interface CategoryManagerDialogProps {
  open: boolean
  onClose: () => void
}

export function CategoryManagerDialog({ open, onClose }: CategoryManagerDialogProps) {
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const archiveCategory = useArchiveCategory()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].hex)

  function resetForm() {
    setEditingId(null)
    setName('')
    setKind('expense')
    setColor(CATEGORY_COLORS[0].hex)
  }

  function startEdit(c: Category) {
    setEditingId(c.id)
    setName(c.name)
    setKind(c.kind)
    setColor(c.color)
  }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingId) {
      await updateCategory.mutateAsync({ id: editingId, name: trimmed, kind, color })
    } else {
      await createCategory.mutateAsync({ name: trimmed, kind, color })
    }
    resetForm()
  }

  const isSaving = createCategory.isPending || updateCategory.isPending

  return (
    <Dialog open={open} onClose={onClose} title="Categorías" footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="flex flex-col gap-6">
        <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 rounded-chip px-1 py-1.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
              <span className="text-[11px] text-chalk-faint">{c.kind === 'income' ? 'ingreso' : 'gasto'}</span>
              <button
                type="button"
                onClick={() => startEdit(c)}
                aria-label={`Editar ${c.name}`}
                className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
              >
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                  <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => archiveCategory.mutate(c.id)}
                aria-label={`Archivar ${c.name}`}
                className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
              >
                <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden>
                  <path
                    d="M3 3l8 8M11 3l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 border-t border-ink-800 pt-5">
          <p className="eyebrow">{editingId ? 'Editar categoría' : 'Nueva categoría'}</p>

          <div className="flex gap-1.5">
            <Chip active={kind === 'expense'} onClick={() => setKind('expense')}>
              Gasto
            </Chip>
            <Chip active={kind === 'income'} onClick={() => setKind('income')}>
              Ingreso
            </Chip>
          </div>

          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mascotas, Regalos…" />
          </Field>

          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} />
          </Field>

          <div className="mt-1 flex gap-2">
            {editingId && (
              <Button variant="ghost" onClick={resetForm} className="flex-1">
                Cancelar
              </Button>
            )}
            <Button variant="outline" onClick={handleSubmit} disabled={!name.trim() || isSaving} className="flex-1">
              {isSaving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar categoría'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
