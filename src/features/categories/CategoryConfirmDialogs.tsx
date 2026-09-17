import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { Category, CategoryUsage } from '@/features/categories/api'

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

/** Sólo se abre cuando la categoría tiene registros asociados (ver `CategoryListRow`) — sin uso,
 *  archivar es una acción de bajo riesgo y no vale la pena la fricción extra. */
export function ArchiveCategoryDialog({ open, onClose, category, usage, onConfirm, pending }: ArchiveCategoryDialogProps) {
  const breakdown = usageBreakdown(usage)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Archivar categoría"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={onConfirm} disabled={pending}>
            {pending ? 'Archivando…' : 'Archivar'}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-fg-secondary">
        ¿Archivar <span className="text-fg">{category.name}</span>?
        {breakdown
          ? ` Tiene ${breakdown}: siguen igual, con su categoría. Deja de ofrecerse al cargar algo nuevo y la podés reactivar desde Archivadas.`
          : ' Deja de ofrecerse al cargar algo nuevo y la podés reactivar desde Archivadas.'}
      </p>
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

/** A diferencia de archivar, esto sí se puede deshacer: por eso siempre confirma, tenga o no
 *  registros asociados (mismo criterio que `FixedExpenseDeleteConfirmDialog`). Con registros, deja
 *  explícito que quedan como "Sin categoría" en vez de borrarse. */
export function DeleteCategoryDialog({ open, onClose, category, usage, onConfirm, pending }: DeleteCategoryDialogProps) {
  const breakdown = usageBreakdown(usage)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Eliminar categoría"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="dialogFooter" onClick={onConfirm} disabled={pending}>
            {pending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </>
      }
    >
      <p className="text-[14px] text-fg-secondary">
        ¿Eliminar <span className="text-fg">{category.name}</span>?
        {breakdown ? ` Sus ${breakdown} quedan como Sin categoría. No se puede deshacer.` : ' No se puede deshacer.'}
      </p>
    </Dialog>
  )
}
