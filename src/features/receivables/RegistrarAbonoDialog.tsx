import { useState } from 'react'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { useRegisterReceivablePayment } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'

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
 * "Registrar un ingreso" arranca en `already_expensed` (lo que el RPC haría solo si no se manda
 * nada) pero es editable con un toque, mismo patrón de `Chip` que el resto de la app: cubre el caso
 * de "ya cargué el ingreso a mano en Movimientos, no lo dupliques" o al revés. Tocarlo lejos del
 * default muestra una advertencia — la decisión sigue siendo del usuario, pero informada.
 */
export function RegistrarAbonoDialog({ open, onClose, summary }: RegistrarAbonoDialogProps) {
  const { receivable, pendingCents } = summary
  const alreadyExpensed = receivable.already_expensed
  const { data: categories } = useCategories()
  const incomeCategories = (categories ?? []).filter((c) => c.kind === 'income')

  const [amountInput, setAmountInput] = useState(() => centsToInputText(pendingCents))
  const [occurredOn, setOccurredOn] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [categoryId, setCategoryId] = useState('')
  const [createIncome, setCreateIncome] = useState(alreadyExpensed)
  const [error, setError] = useState<string | null>(null)
  const registerPayment = useRegisterReceivablePayment()
  const [accountId, setAccountId] = useDefaultAccountId()

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
      categoryId: createIncome ? categoryId || null : null,
      createIncome,
      accountId: createIncome ? accountId || null : null,
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

        <div>
          <p className="eyebrow mb-2">Registrar un ingreso por este monto</p>
          <div className="flex gap-1.5">
            <Chip active={createIncome} onClick={() => setCreateIncome(true)}>
              Sí
            </Chip>
            <Chip active={!createIncome} onClick={() => setCreateIncome(false)}>
              No
            </Chip>
          </div>
        </div>

        {createIncome && (
          <>
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

            <Field label="Dónde entró" hint="Opcional">
              <AccountSelect value={accountId} onChange={setAccountId} />
            </Field>
          </>
        )}

        {createIncome !== alreadyExpensed ? (
          <p className="text-[12px] text-coral">
            {createIncome
              ? 'Esta plata nunca salió de tu saldo. Registrar un ingreso la va a contar dos veces.'
              : 'Esa plata había salido de tu saldo como gasto. Si no registrás el ingreso, el saldo va a quedar corto — desactivalo sólo si ya lo cargaste a mano.'}
          </p>
        ) : (
          <p className="text-[12px] text-chalk-faint">
            {createIncome
              ? 'Se registra un ingreso por este monto — esa plata había salido de tu saldo cuando cargaste el gasto.'
              : 'No se registra ningún movimiento: esa plata nunca salió de tu saldo. Sumala en el lugar donde entró desde Cuadrar saldo.'}
          </p>
        )}

        {completa && <p className="text-[12px] text-chalk-faint">Con este abono la deuda queda saldada.</p>}
      </div>
    </Dialog>
  )
}
