import { useState } from 'react'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { useRegisterReceivablePayment } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'

interface RegistrarAbonoDialogProps {
  open: boolean
  onClose: () => void
  summary: ReceivableSummary
}

/**
 * Registrar un abono. El importe arranca prellenado con lo pendiente (no con el total): cubre el
 * caso dominante — te pagan todo de una — sin ramificar el código; un pago único es simplemente un
 * solo abono por el total. No anida ningún otro diálogo, mismo criterio que `MarkPaidDialog`.
 *
 * Sólo cuando la deuda tiene `already_expensed` el RPC genera un ingreso — acá se le pide categoría
 * y se explica por qué; en el caso normal (prestaste efectivo) se aclara que no se toca el saldo.
 */
export function RegistrarAbonoDialog({ open, onClose, summary }: RegistrarAbonoDialogProps) {
  const { receivable, pendingCents } = summary
  const alreadyExpensed = receivable.already_expensed
  const { data: categories } = useCategories()
  const incomeCategories = (categories ?? []).filter((c) => c.kind === 'income')

  const [amountInput, setAmountInput] = useState(() => centsToInputText(pendingCents))
  const [occurredOn, setOccurredOn] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const registerPayment = useRegisterReceivablePayment()

  const cents = parseAmountToCents(amountInput)
  const completa = cents != null && cents >= pendingCents

  async function handleConfirm() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    await registerPayment.mutateAsync({
      receivableId: receivable.id,
      cents,
      occurredOn,
      categoryId: alreadyExpensed ? categoryId || null : null,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar abono"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={registerPayment.isPending}>
            {registerPayment.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{receivable.name}</p>
          <p className="mt-1 text-[13px] text-chalk-faint">
            <Money cents={pendingCents} tone="dim" /> de <Money cents={receivable.amountCents} tone="dim" /> pendiente
          </p>
        </div>

        <Field label="Importe del abono" error={error ?? undefined}>
          <AmountInput
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value)
              setError(null)
            }}
            invalid={!!error}
            autoFocus
          />
        </Field>

        <Field label="Fecha" htmlFor="occurredOn">
          <Input id="occurredOn" type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </Field>

        {alreadyExpensed && (
          <Field label="Categoría" htmlFor="categoryId" hint="Opcional">
            <Select id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Elegir…</option>
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <p className="text-[12px] text-chalk-faint">
          {alreadyExpensed
            ? 'Se registra un ingreso por este monto — esa plata había salido de tu saldo cuando cargaste el gasto.'
            : 'No se registra ningún movimiento: esa plata nunca salió de tu saldo. Sumala en el lugar donde entró desde Cuadrar saldo.'}
        </p>

        {completa && <p className="text-[12px] text-chalk-faint">Con este abono la deuda queda saldada.</p>}
      </div>
    </Dialog>
  )
}
