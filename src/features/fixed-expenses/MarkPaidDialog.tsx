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
  /** Sólo bolsas: lo ya cargado en este período, para mostrar contexto ("$40.000 de $60.000"). Un
   *  fijo de una sola vez siempre abre este diálogo sin pago previo, así que vale 0. */
  alreadyPaidCents?: number
}

/**
 * El importe pagado puede diferir del de la plantilla (aumentos, ajustes) — este popup lo permite
 * en el momento de marcar como pagado.
 *
 * Fijo de una sola vez: prellenado con el importe actual y sin autofocus — el caso dominante es
 * "vino igual, confirmo", y el autofocus en mobile levanta el teclado para nada.
 *
 * Bolsa (`is_recurring`): cada carga es un importe distinto (la nafta de esta semana no cuesta lo
 * mismo que la de la semana pasada), así que arranca vacío y con autofocus — acá sí hay algo para
 * escribir.
 *
 * No anida ningún otro diálogo (a diferencia de CuadrarSaldoDialog/BucketDetailDialog) — no hace
 * falta el filtro de "close" que esos dos necesitan para no cerrarse en cascada.
 */
export function MarkPaidDialog({ open, onClose, fixedExpense, period, alreadyPaidCents = 0 }: MarkPaidDialogProps) {
  const isRecurring = fixedExpense.is_recurring
  const [input, setInput] = useState(() => (isRecurring ? '' : centsToInputText(fixedExpense.cents)))
  const [error, setError] = useState<string | null>(null)
  const markPaid = useMarkFixedExpensePaid()

  const cents = parseAmountToCents(input)
  const willUpdateTemplate = !isRecurring && permiteActualizarPlantilla(period, new Date())
  const differs = !isRecurring && cents != null && cents !== fixedExpense.cents
  const remainingAfter = isRecurring ? Math.max(fixedExpense.cents - alreadyPaidCents - (cents ?? 0), 0) : 0

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
      title={isRecurring ? 'Registrar carga' : 'Marcar como pagado'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Guardando…' : isRecurring ? 'Registrar' : 'Marcar pagado'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{fixedExpense.name}</p>
          {isRecurring ? (
            <p className="mt-1 text-[13px] text-chalk-faint">
              <Money cents={alreadyPaidCents} tone="dim" /> de <Money cents={fixedExpense.cents} tone="dim" /> este mes
            </p>
          ) : (
            <Money cents={fixedExpense.cents} tone="dim" size="figure" className="mt-1" />
          )}
        </div>

        <Field label={isRecurring ? 'Importe de esta carga' : 'Importe pagado'} error={error ?? undefined}>
          <AmountInput
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            invalid={!!error}
            autoFocus={isRecurring}
          />
        </Field>

        {isRecurring && cents != null && cents > 0 && (
          <p className="text-[12px] text-chalk-faint">
            {remainingAfter > 0 ? (
              <>
                Después de esta carga, falta <Money cents={remainingAfter} tone="dim" />.
              </>
            ) : (
              'Con esta carga completás el presupuesto del mes.'
            )}
          </p>
        )}

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
