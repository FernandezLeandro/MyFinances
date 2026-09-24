import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { accountNameOf, transactionDeleteEffect } from '@/features/accounts/aggregate'
import { useCategories } from '@/features/categories/api'
import { useDeleteTransaction, type Transaction } from '@/features/transactions/api'

/**
 * Detalle de sólo lectura de un movimiento, con la única acción que ofrece: eliminarlo. Dos usos —
 * Bloque 4 del arreglo de Movimientos (D1, MO-08): un "Ajuste de saldo" no se edita más desde acá
 * (para corregirlo se hace un reajuste nuevo desde Cuentas), sólo se borra, avisando antes cómo
 * queda la cuenta (`transactionDeleteEffect`, mismo criterio que ya usa `TransferDetailDialog` para
 * una transferencia). Bloque 5 (D2): en Básico, cualquier movimiento suelto que no sea el pago de un
 * fijo ni "Sueldo" abre este mismo detalle en vez del formulario completo.
 *
 * Falla adentro del diálogo, que no se cierra (patrón 5b); el éxito cierra y avisa con un toast —
 * mismo patrón que `TransferDetailDialog`.
 */
export function MovementDetailDialog({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const { data: categories } = useCategories(true)
  const deleteTx = useDeleteTransaction()
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const byId = new Map((locations ?? []).map((l) => [l.id, l]))
  const nameOf = (id: string) => accountNameOf(byId, id)
  const effect = transactionDeleteEffect({ transaction, balances, nameOf })
  const category = (categories ?? []).find((c) => c.id === transaction.category_id) ?? null

  async function remove() {
    setBusy(true)
    setSaveError(null)
    try {
      await deleteTx.mutateAsync(transaction.id)
      showToast('Movimiento eliminado', 'ok')
      onClose()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={transaction.is_adjustment ? 'Ajuste de saldo' : 'Movimiento'}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button variant="dangerSolid" size="dialogFooter" onClick={remove} loading={busy}>
            {busy ? 'Eliminando…' : saveError ? 'Reintentar' : 'Eliminar'}
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <Money cents={transaction.cents} size="total" tone={transaction.type === 'income' ? 'accent' : 'fg'} />
          <p className="mt-2.5 text-[14px] font-medium break-words text-fg">
            {transaction.description?.trim() || (transaction.is_adjustment ? 'Ajuste de saldo' : 'Sin descripción')}
          </p>
          <p className="mt-1 text-[12.5px] break-words text-fg-muted">
            {format(parseISO(transaction.occurred_on), "d 'de' MMMM 'de' yyyy", { locale: es })}
            {category ? ` · ${category.name}` : ''}
            {transaction.account_id ? ` · ${nameOf(transaction.account_id)}` : ''}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          <p>{effect.text}</p>
          {effect.warning && <p className="font-semibold text-fg">{effect.warning}</p>}
        </div>
        {saveError && <DialogSaveError title="No se pudo eliminar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
