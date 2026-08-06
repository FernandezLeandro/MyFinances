import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'
import { useArchiveCategory, useCategories, useCreateCategory, type CategoryKind } from '@/features/categories/api'

interface CategoryManagerDialogProps {
  open: boolean
  onClose: () => void
}

export function CategoryManagerDialog({ open, onClose }: CategoryManagerDialogProps) {
  const { data: categories } = useCategories()
  const createCategory = useCreateCategory()
  const archiveCategory = useArchiveCategory()

  const [name, setName] = useState('')
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].hex)

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createCategory.mutateAsync({ name: trimmed, kind, color })
    setName('')
    setColor(CATEGORY_COLORS[0].hex)
  }

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
          <p className="eyebrow">Nueva categoría</p>

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

          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                aria-label={`Color ${c.name}`}
                aria-pressed={color === c.hex}
                className={cn(
                  'size-6 rounded-full transition-transform duration-150',
                  color === c.hex && 'ring-2 ring-chalk ring-offset-2 ring-offset-ink-900',
                )}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={handleAdd}
            disabled={!name.trim() || createCategory.isPending}
            className="mt-1"
          >
            {createCategory.isPending ? 'Agregando…' : 'Agregar categoría'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
