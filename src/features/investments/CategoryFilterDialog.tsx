import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { CheckRow } from '@/components/ui/CheckRow'
import { DialogEmptyNote } from '@/components/ui/dialog-parts'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { UNCATEGORIZED } from './aggregate'

interface CategoryFilterDialogProps {
  open: boolean
  onClose: () => void
  categories: readonly { id: string; name: string; color: string; icon: string }[]
  /** Vacío = todas. */
  selected: readonly string[]
  /** Hay inversiones cuya categoría se borró: se ofrece «Sin categoría». */
  hasUncategorized: boolean
  onApply: (ids: string[]) => void
}

/** Elegir qué categorías mirar: ninguna tildada es «todas». Se aplica recién con el botón. */
export function CategoryFilterDialog({ open, onClose, categories, selected, hasUncategorized, onApply }: CategoryFilterDialogProps) {
  const [draft, setDraft] = useState<string[]>([...selected])

  function toggle(id: string) {
    setDraft((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Categorías"
      subtitle={draft.length === 0 ? 'Viendo todas' : `${draft.length} elegida${draft.length === 1 ? '' : 's'}`}
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={() => setDraft([])} disabled={draft.length === 0}>
            Ver todas
          </Button>
          <Button size="dialogFooter" onClick={() => onApply(draft)}>
            Aplicar
          </Button>
        </>
      }
    >
      {categories.length === 0 && !hasUncategorized ? (
        <DialogEmptyNote>No tenés categorías de inversión. Creá una en Categorías.</DialogEmptyNote>
      ) : (
        <ul>
          {categories.map((c) => (
            <CheckRow
              key={c.id}
              leading={<CategoryChip color={c.color} icon={c.icon} size={28} />}
              name={c.name}
              checked={draft.includes(c.id)}
              onToggle={() => toggle(c.id)}
            />
          ))}
          {hasUncategorized && (
            <CheckRow
              leading={<CategoryChip color="#A0A0A8" icon="tag" size={28} />}
              name="Sin categoría"
              checked={draft.includes(UNCATEGORIZED)}
              onToggle={() => toggle(UNCATEGORIZED)}
            />
          )}
        </ul>
      )}
    </Dialog>
  )
}
