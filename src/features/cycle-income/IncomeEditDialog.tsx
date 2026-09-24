import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useDeleteTransaction, useUpdateTransaction, type Transaction } from '@/features/transactions/api'
import { ConfirmDeleteMovementDialog } from '@/features/transactions/ConfirmDeleteMovementDialog'
import { confirmDeleteMovementCopy } from '@/features/transactions/aggregate'

interface IncomeEditDialogProps {
  transaction: Transaction
  onClose: () => void
}

/**
 * Bloque 5 del arreglo de Movimientos (D2, MO-11): en Básico, tocar "Sueldo" en Movimientos abría el
 * formulario COMPLETO de edición — categoría, cuenta, y hasta el chip para pasarlo a Gasto, algo que
 * el plan pensado para controlar sólo fijos no debería ofrecer. Esta edición chica es el mismo
 * recorte que ya hace `AssignIncomeDialog` para el alta: sólo importe y detalle, sin tipo, categoría
 * ni cuenta (se mantienen los que ya tenía el movimiento). Tipo, fecha y cuenta no se tocan.
 */
export function IncomeEditDialog({ transaction, onClose }: IncomeEditDialogProps) {
  const [input, setInput] = useState(centsToInputText(transaction.cents))
  const [note, setNote] = useState(transaction.description ?? '')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  async function handleSave() {
    const cents = parseAmountToCents(input)
    if (cents == null || cents <= 0) {
      setAmountError('Ingresá un importe válido')
      return
    }
    await updateTx.mutateAsync({
      id: transaction.id,
      type: transaction.type,
      cents,
      occurredOn: transaction.occurred_on,
      categoryId: transaction.category_id,
      description: note.trim() || null,
      accountId: transaction.account_id,
    })
    onClose()
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title="Editar ingreso"
        footer={
          <>
            <Button
              variant="danger"
              size="dialogFooter"
              onClick={() => setConfirmingDelete(true)}
              disabled={deleteTx.isPending}
              className="sm:mr-auto"
            >
              Eliminar
            </Button>
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="dialogFooter" onClick={handleSave} disabled={updateTx.isPending}>
              {updateTx.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Importe" error={amountError ?? undefined}>
            <AmountInput
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setAmountError(null)
              }}
              invalid={!!amountError}
              autoFocus
            />
          </Field>

          <Field label="Detalle" hint="Opcional">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sueldo, adelanto…" maxLength={80} />
          </Field>
        </div>
      </Dialog>
      <ConfirmDeleteMovementDialog
        open={confirmingDelete}
        busy={deleteTx.isPending}
        copy={confirmDeleteMovementCopy({ kind: 'plain', description: transaction.description })}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => deleteTx.mutate(transaction.id, { onSuccess: onClose })}
      />
    </>
  )
}
