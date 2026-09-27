import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogConfirmStack, DialogItemCard } from '@/components/ui/dialog-parts'
import { Money } from '@/components/ui/Money'
import { useBalanceLocations } from '@/features/accounts/api'
import { accountNameOf } from '@/features/accounts/aggregate'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import type { ConfirmDeleteMovementCopy } from './aggregate'
import type { Transaction } from './api'

interface ConfirmDeleteMovementDialogProps {
  open: boolean
  busy: boolean
  /** El movimiento en juego — su ficha, nombre, fecha · cuenta y monto arman la tarjeta de la
   *  confirmación «Pila». `null` cuando `open` es `false`, para no exigirlo antes de tener uno. */
  transaction: Transaction | null
  /** El texto ya armado — `confirmDeleteMovementCopy` (Movimientos.tsx, el toque de Básico) u
   *  `originDeleteCopy` (`TransactionFormDialog`, que cubre todos los orígenes desde el Bloque 3 del
   *  arreglo de Movimientos). El diálogo sólo lo muestra, no decide qué texto usar. */
  copy: ConfirmDeleteMovementCopy
  onClose: () => void
  onConfirm: () => void
}

/**
 * Confirma antes de borrar un movimiento — Bloque 1 del QA de Fijos (FI-03, FI-05) para el pago/
 * guardado de un fijo, y Bloque 1/3 del arreglo de Movimientos (MO-01 a MO-06) para el resto de los
 * orígenes. La montan `TransactionFormDialog` (botón Eliminar) y `Movimientos.tsx` (el toque de una
 * fila en Básico). Nació como `RemoveLinkedMovementDialog` en `features/fixed-expenses`, sólo para
 * lo vinculado a un fijo; se generalizó y se mudó acá porque ya cubre cualquier movimiento.
 *
 * Confirmación «Pila» del rediseño (K1-Stack): tarjeta con la ficha de lo que se borra, texto corto
 * y la acción destructiva sólida a todo el ancho.
 */
export function ConfirmDeleteMovementDialog({ open, busy, transaction, copy, onClose, onConfirm }: ConfirmDeleteMovementDialogProps) {
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()

  if (!open || !transaction) return null

  const category = (categories ?? []).find((c) => c.id === transaction.category_id) ?? null
  const byId = new Map((locations ?? []).map((l) => [l.id, l]))
  const accountName = transaction.account_id ? accountNameOf(byId, transaction.account_id) : null
  const meta = [format(parseISO(transaction.occurred_on), 'd MMM', { locale: es }), accountName].filter(Boolean).join(' · ')

  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      icon={<Trash2 className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      tone="danger"
      size="sm"
      ownsPending
      footer={<DialogConfirmStack confirmLabel={copy.confirmLabel} pending={busy} onConfirm={onConfirm} onCancel={onClose} />}
    >
      <div className="flex flex-col gap-4">
        <DialogItemCard
          leading={<CategoryChip {...chipLook(category ?? undefined, { adjustment: transaction.is_adjustment })} size={38} />}
          title={transaction.description?.trim() || category?.name || 'Sin descripción'}
          meta={meta}
          amount={<Money cents={transaction.cents} size="inline" tone={transaction.type === 'income' ? 'accent' : 'fg'} />}
        />
        <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          {copy.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
