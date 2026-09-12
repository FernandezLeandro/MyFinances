import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useAddFixedExpenseSaving, useMarkFixedExpensePaid, type FixedExpense } from '@/features/fixed-expenses/api'
import { bagPeriodNoun, permiteActualizarPlantilla } from '@/features/fixed-expenses/period'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useCan } from '@/features/access/useCan'

type Mode = 'pay' | 'save'

interface MarkPaidDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
  /** Día 1 del mes que se está marcando — el mismo `period` que ya maneja Fijos.tsx. */
  period: string
  /** Sólo bolsas: lo ya cargado en este período, para mostrar contexto ("$40.000 de $60.000"). Un
   *  fijo de una sola vez siempre abre este diálogo sin pago previo, así que vale 0. */
  alreadyPaidCents?: number
  /** Bloque 3, sólo fijos "una vez al mes": lo ya guardado en este período — sin capar contra el
   *  importe del fijo (mismo criterio que `FixedExpenseStatus.savedCents`). Une bolsa no guarda, así
   *  que este prop no aplica ahí. */
  alreadySavedCents?: number
}

/**
 * El importe pagado puede diferir del de la plantilla (aumentos, ajustes) — este popup lo permite
 * en el momento de marcar como pagado.
 *
 * Fijo de una sola vez: prellenado con el importe actual y sin autofocus — el caso dominante es
 * "vino igual, confirmo", el autofocus en mobile levanta el teclado para nada. Bloque 3: además
 * tiene los chips Pagar/Guardar — "Guardar" registra que ya se apartó plata para este fijo, sin
 * generar movimiento (ver `useAddFixedExpenseSaving`). Una bolsa no los tiene: ya se va cargando de
 * a partes como gasto real, guardar "para" ella no aplica (decisión del plan).
 *
 * Bolsa (`is_recurring`): cada carga es un importe distinto (la nafta de esta semana no cuesta lo
 * mismo que la de la semana pasada), así que arranca vacío y con autofocus — acá sí hay algo para
 * escribir.
 *
 * No anida ningún otro diálogo (a diferencia de CuadrarSaldoDialog/BucketDetailDialog) — no hace
 * falta el filtro de "close" que esos dos necesitan para no cerrarse en cascada.
 */
export function MarkPaidDialog({
  open,
  onClose,
  fixedExpense,
  period,
  alreadyPaidCents = 0,
  alreadySavedCents = 0,
}: MarkPaidDialogProps) {
  const isRecurring = fixedExpense.is_recurring
  const [mode, setMode] = useState<Mode>('pay')
  const isSaving = !isRecurring && mode === 'save'
  const [input, setInput] = useState(() => (isRecurring ? '' : centsToInputText(fixedExpense.cents)))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const markPaid = useMarkFixedExpensePaid()
  const addSaving = useAddFixedExpenseSaving()
  const canCuentas = useCan('cuentas')
  const [accountId, setAccountId] = useDefaultAccountId()

  const bagPeriod = bagPeriodNoun(fixedExpense.bag_frequency)
  const cents = parseAmountToCents(input)
  const willUpdateTemplate = !isRecurring && !isSaving && permiteActualizarPlantilla(period, new Date())
  const differs = !isRecurring && !isSaving && cents != null && cents !== fixedExpense.cents
  const remainingAfter = isRecurring
    ? Math.max(fixedExpense.cents - alreadyPaidCents - (cents ?? 0), 0)
    : isSaving
      ? Math.max(fixedExpense.cents - alreadySavedCents - (cents ?? 0), 0)
      : 0
  const isPending = markPaid.isPending || addSaving.isPending

  function selectMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    // Pagar sugiere el importe del fijo (el caso dominante: "vino igual, confirmo") — Guardar
    // sugiere lo que todavía falta juntar, para que "guardar el resto" sea completar sin pensar.
    setInput(next === 'pay' ? centsToInputText(fixedExpense.cents) : centsToInputText(Math.max(fixedExpense.cents - alreadySavedCents, 0)))
  }

  async function handleConfirm() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    if (isSaving) {
      await addSaving.mutateAsync({ fixedExpenseId: fixedExpense.id, period, cents })
    } else {
      await markPaid.mutateAsync({
        fixedExpenseId: fixedExpense.id,
        period,
        cents,
        note: note.trim() || null,
        accountId: accountId || null,
      })
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isRecurring ? 'Registrar carga' : isSaving ? 'Guardar para este fijo' : 'Marcar como pagado'}
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Guardando…' : isRecurring ? 'Registrar' : isSaving ? 'Guardar' : 'Marcar pagado'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{fixedExpense.name}</p>
          {isRecurring ? (
            <p className="mt-1 text-[13px] text-fg-muted">
              <Money cents={alreadyPaidCents} tone="dim" /> de <Money cents={fixedExpense.cents} tone="dim" /> {bagPeriod.thisPeriod}
            </p>
          ) : (
            <Money cents={fixedExpense.cents} tone="dim" size="figure" className="mt-1" />
          )}
        </div>

        {/* Sólo fijos de una sola vez: una bolsa siempre "registra una carga" (paga), no tiene
            sentido "guardar para" un presupuesto que ya se va gastando de a partes. */}
        {!isRecurring && (
          <div className="flex gap-1.5">
            <Chip active={mode === 'pay'} onClick={() => selectMode('pay')}>
              Pagar
            </Chip>
            <Chip active={mode === 'save'} onClick={() => selectMode('save')}>
              Guardar
            </Chip>
          </div>
        )}

        {!isRecurring && mode === 'pay' && alreadySavedCents > 0 && (
          <p className="text-[12px] text-fg-muted">
            Tenés <Money cents={alreadySavedCents} tone="dim" size="inline" /> guardado para este fijo.
          </p>
        )}

        <Field
          label={isRecurring ? 'Importe de esta carga' : isSaving ? 'Importe guardado' : 'Importe pagado'}
          error={error ?? undefined}
        >
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

        {isRecurring && (
          <Field label="Detalle" hint="Opcional — es lo que se ve en el movimiento">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Chino del barrio, súper…"
              maxLength={80}
            />
          </Field>
        )}

        {/* El guardado no genera movimiento — no hay con qué pagarlo. */}
        {canCuentas && !isSaving && (
          <Field label="Con qué lo pagué" hint="Opcional">
            <AccountSelect value={accountId} onChange={setAccountId} />
          </Field>
        )}

        {isRecurring && cents != null && cents > 0 && (
          <p className="text-[12px] text-fg-muted">
            {remainingAfter > 0 ? (
              <>
                Después de esta carga, falta <Money cents={remainingAfter} tone="dim" />.
              </>
            ) : (
              `Con esta carga completás el presupuesto ${bagPeriod.adjective}.`
            )}
          </p>
        )}

        {isSaving && cents != null && cents > 0 && (
          <p className="text-[12px] text-fg-muted">
            {remainingAfter > 0 ? (
              <>
                Después de esto, te falta guardar <Money cents={remainingAfter} tone="dim" />.
              </>
            ) : (
              'Con esto lo tenés cubierto.'
            )}
          </p>
        )}

        {differs && (
          <p className="text-[12px] text-fg-muted">
            {willUpdateTemplate
              ? 'El importe del fijo pasa a este valor de acá en adelante.'
              : 'Estás marcando un mes pasado — el importe del fijo no se toca.'}
          </p>
        )}
      </div>
    </Dialog>
  )
}
