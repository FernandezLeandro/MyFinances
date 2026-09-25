import { useRef, useState } from 'react'
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
  // HO-13 del QA de Hoy: mismo candado que `AssignIncomeDialog` (FI-01/FI-11) — y `.mutate()` en vez
  // de `await mutateAsync()` (lección del README de QA: sin `try/catch`, un `mutateAsync` esperado
  // deja una promesa rechazada sin manejar en la consola si la base frena la escritura).
  const submittingRef = useRef(false)

  function handleSave() {
    const cents = parseAmountToCents(input)
    if (cents == null || cents <= 0) {
      setAmountError('Ingresá un importe válido')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    updateTx.mutate(
      {
        id: transaction.id,
        type: transaction.type,
        cents,
        occurredOn: transaction.occurred_on,
        categoryId: transaction.category_id,
        description: note.trim() || null,
        accountId: transaction.account_id,
      },
      { onSuccess: onClose, onSettled: () => { submittingRef.current = false } },
    )
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
