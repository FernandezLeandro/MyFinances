import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useMarkFixedExpensePaid, type FixedExpense } from '@/features/fixed-expenses/api'
import { permiteActualizarPlantilla } from '@/features/fixed-expenses/period'

interface MarkPaidDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
  /** Día 1 del mes que se está marcando — el mismo `period` que ya maneja Fijos.tsx. */
  period: string
}

/**
 * El importe pagado puede diferir del de la plantilla (aumentos, ajustes) — este popup lo permite
 * en el momento de marcar como pagado. Prellenado con el importe actual y sin autofocus: el caso
 * dominante es "vino igual, confirmo", y el autofocus en mobile levanta el teclado para nada.
 *
 * No anida ningún otro diálogo (a diferencia de CuadrarSaldoDialog/BucketDetailDialog) — no hace
 * falta el filtro de "close" que esos dos necesitan para no cerrarse en cascada.
 */
export function MarkPaidDialog({ open, onClose, fixedExpense, period }: MarkPaidDialogProps) {
  const [input, setInput] = useState(() => centsToInputText(fixedExpense.cents))
  const [error, setError] = useState<string | null>(null)
  const markPaid = useMarkFixedExpensePaid()

  const cents = parseAmountToCents(input)
  const willUpdateTemplate = permiteActualizarPlantilla(period, new Date())
  const differs = cents != null && cents !== fixedExpense.cents

  async function handleConfirm() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    await markPaid.mutateAsync({ fixedExpenseId: fixedExpense.id, period, cents })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Marcar como pagado"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Guardando…' : 'Marcar pagado'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{fixedExpense.name}</p>
          <Money cents={fixedExpense.cents} tone="dim" size="figure" className="mt-1" />
        </div>

        <Field label="Importe pagado" error={error ?? undefined}>
          <AmountInput
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            invalid={!!error}
          />
        </Field>

        {differs && (
          <p className="text-[12px] text-chalk-faint">
            {willUpdateTemplate
              ? 'El importe del fijo pasa a este valor de acá en adelante.'
              : 'Estás marcando un mes pasado — el importe del fijo no se toca.'}
          </p>
        )}
      </div>
    </Dialog>
  )
}
