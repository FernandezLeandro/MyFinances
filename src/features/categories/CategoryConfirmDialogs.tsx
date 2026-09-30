import { Archive, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogConfirmStack, DialogItemCard } from '@/components/ui/dialog-parts'
import type { Category, CategoryUsage } from '@/features/categories/api'
import { CategoryChip } from './CategoryChip'

/** "12 movimientos y 2 fijos" — nombra los tipos con uso, omite los que están en cero. Mismo
 *  criterio que `previewNames` en la pantalla de categorías: nunca un total a secas cuando hay
 *  detalle más concreto para dar. */
function usageBreakdown(usage: CategoryUsage | undefined): string | null {
  if (!usage || usage.total === 0) return null
  const parts: string[] = []
  if (usage.transactions > 0) parts.push(`${usage.transactions} movimiento${usage.transactions === 1 ? '' : 's'}`)
  if (usage.fixedExpenses > 0) parts.push(`${usage.fixedExpenses} fijo${usage.fixedExpenses === 1 ? '' : 's'}`)
  if (usage.creditPurchases > 0) parts.push(`${usage.creditPurchases} compra${usage.creditPurchases === 1 ? '' : 's'} en cuotas`)
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

interface ArchiveCategoryDialogProps {
  open: boolean
  onClose: () => void
  category: Category
  usage: CategoryUsage | undefined
  onConfirm: () => void
  pending: boolean
}

/** Sólo se abre cuando la categoría tiene registros asociados (ver `handleArchive` en `pages/Categorias.tsx`) — sin uso,
 *  archivar es una acción de bajo riesgo y no vale la pena la fricción extra. */
export function ArchiveCategoryDialog({ open, onClose, category, usage, onConfirm, pending }: ArchiveCategoryDialogProps) {
  const breakdown = usageBreakdown(usage)

  // Confirmación «Pila» con la acción primaria, no roja: archivar no borra nada.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      ownsPending
      title="Archivar categoría"
      icon={<Archive className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      footer={
        <DialogConfirmStack
          tone="primary"
          confirmLabel="Archivar categoría"
          pendingLabel="Archivando…"
          pending={pending}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <DialogItemCard
          leading={<CategoryChip color={category.color} icon={category.icon} size={38} />}
          title={category.name}
          meta={[category.kind === 'expense' ? 'De gasto' : 'De ingreso', breakdown].filter(Boolean).join(' · ')}
        />
        <p className="text-[14px] text-fg-secondary">
          {breakdown ? 'Lo ya cargado sigue igual, con su categoría. ' : ''}Deja de ofrecerse al cargar algo nuevo; la reactivás desde Archivadas.
        </p>
      </div>
    </Dialog>
  )
}

interface DeleteCategoryDialogProps {
  open: boolean
  onClose: () => void
  category: Category
  usage: CategoryUsage | undefined
  onConfirm: () => void
  pending: boolean
}

/** A diferencia de archivar, esto no se puede deshacer: por eso siempre confirma, tenga o no
 *  registros asociados (mismo criterio que `FixedExpenseDeleteConfirmDialog`). Con registros, deja
 *  explícito que quedan como "Sin categoría" en vez de borrarse.
 *
 *  Confirmación «Pila» del rediseño: tarjeta con la ficha de lo que se borra, texto corto, y la
 *  acción destructiva sólida a todo el ancho con Cancelar como texto debajo. */
export function DeleteCategoryDialog({ open, onClose, category, usage, onConfirm, pending }: DeleteCategoryDialogProps) {
  const breakdown = usageBreakdown(usage)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      ownsPending
      title="Eliminar categoría"
      icon={<Trash2 className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      tone="danger"
      footer={
        <DialogConfirmStack
          confirmLabel="Eliminar categoría"
          pendingLabel="Eliminando…"
          pending={pending}
          onConfirm={onConfirm}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <DialogItemCard
          leading={<CategoryChip color={category.color} icon={category.icon} size={38} />}
          title={category.name}
          meta={`${category.kind === 'expense' ? 'De gasto' : 'De ingreso'} · archivada`}
        />
        <p className="text-[14px] text-fg-secondary">
          {breakdown ? `Sus ${breakdown} quedan como «Sin categoría». ` : ''}No se puede deshacer.
        </p>
      </div>
    </Dialog>
  )
}
