import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { RefreshCw, Wallet } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { cycleContaining, cycleLabel } from '@/lib/cycle'
import { useCycleConfig } from '@/lib/useCycle'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { accountNameOf, transactionDeleteEffect } from '@/features/accounts/aggregate'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { useDeleteTransaction, type Transaction } from '@/features/transactions/api'

/**
 * Detalle de sólo lectura de un movimiento, con la única acción que ofrece: eliminarlo. Dos usos —
 * Bloque 4 del arreglo de Movimientos (D1, MO-08): un "Ajuste de saldo" no se edita más desde acá
 * (para corregirlo se hace un reajuste nuevo desde Cuentas), sólo se borra, avisando antes cómo
 * queda la cuenta (`transactionDeleteEffect`, mismo criterio que ya usa `TransferDetailDialog` para
 * una transferencia). Bloque 5 (D2): en Básico, cualquier movimiento suelto que no sea el pago de un
 * fijo ni "Sueldo" abre este mismo detalle en vez del formulario completo. Sin «Editar»: en ninguno
 * de los dos casos el movimiento se puede editar desde acá.
 *
 * Rediseño de modales v2, Detalle «recibo»: header a banda con el color de la categoría (`Dialog`
 * prop `tint`), importe grande centrado con la fecha larga debajo, y una tarjeta con Cuenta/Ciclo
 * (Categoría ya va en el header, no se repite). El texto de qué le pasa a la cuenta al eliminar se
 * mantiene bajo la tarjeta — es el único aviso, no hay una confirmación aparte para este diálogo. Un
 * ajuste de saldo o un movimiento sin categoría van con el header sin `tint` (ficha neutra de
 * `chipLook`): no hay color de categoría real que teñir.
 *
 * Falla adentro del diálogo, que no se cierra (patrón 5b); el éxito cierra y avisa con un toast —
 * mismo patrón que `TransferDetailDialog`.
 */
export function MovementDetailDialog({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const { data: categories } = useCategories(true)
  const cycleConfig = useCycleConfig()
  const deleteTx = useDeleteTransaction()
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const byId = new Map((locations ?? []).map((l) => [l.id, l]))
  const nameOf = (id: string) => accountNameOf(byId, id)
  const effect = transactionDeleteEffect({ transaction, balances, nameOf })
  const category = (categories ?? []).find((c) => c.id === transaction.category_id) ?? null
  const cycle = cycleContaining(cycleConfig, parseISO(transaction.occurred_on))
  const look = chipLook(category ?? undefined, { adjustment: transaction.is_adjustment })
  // Sólo una categoría real tiñe el header — las fichas neutras (ajuste, sin categoría) son grises
  // de por sí, no hay color que llevar a la banda.
  const tint = 'color' in look ? look.color : undefined
  const title = transaction.is_adjustment ? 'Ajuste de saldo' : transaction.description?.trim() || 'Sin descripción'
  const subtitle = transaction.is_adjustment
    ? undefined
    : `${category?.name ?? 'Sin categoría'} · ${transaction.type === 'income' ? 'ingreso' : 'gasto'} cargado a mano`

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
      title={title}
      subtitle={subtitle}
      icon={<CategoryChip {...look} size={40} />}
      tint={tint}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar
          start={
            <Button variant="ghost" size="dialogFooter" onClick={remove} loading={busy} className="text-negative! hover:text-negative!">
              {busy ? 'Eliminando…' : saveError ? 'Reintentar' : 'Eliminar'}
            </Button>
          }
        >
          <Button variant="outline" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1 pt-1 pb-0.5">
          <Money cents={transaction.cents} size="figure" tone={transaction.type === 'income' ? 'accent' : 'fg'} />
          <p className="text-[12.5px] text-fg-secondary">{format(parseISO(transaction.occurred_on), "EEEE d 'de' MMMM", { locale: es })}</p>
        </div>
        <dl className="flex flex-col rounded-panel-sm border border-border">
          <div className="flex items-center gap-3 border-b border-divider-list px-3.5 py-3">
            <Wallet className="size-[18px] shrink-0 text-fg-secondary" strokeWidth={1.8} aria-hidden />
            <dt className="flex-1 text-[14px] text-fg-secondary">Cuenta</dt>
            <dd className="m-0 text-[14.5px] font-semibold text-fg">
              {transaction.account_id ? nameOf(transaction.account_id) : 'Sin cuenta'}
            </dd>
          </div>
          <div className="flex items-center gap-3 px-3.5 py-3">
            <RefreshCw className="size-[18px] shrink-0 text-fg-secondary" strokeWidth={1.8} aria-hidden />
            <dt className="flex-1 text-[14px] text-fg-secondary">Ciclo</dt>
            <dd className="m-0 text-[14.5px] font-semibold text-fg capitalize">{cycleLabel(cycle)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          <p>{effect.text}</p>
          {effect.warning && <p className="font-semibold text-fg">{effect.warning}</p>}
        </div>
        {saveError && <DialogSaveError title="No se pudo eliminar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
