import { useRef, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useAddFixedExpenseSaving, useMarkFixedExpensePaid, type FixedExpense } from '@/features/fixed-expenses/api'
import { amountAfterCopy } from '@/features/fixed-expenses/aggregate'
import { bagPeriodNoun, permiteActualizarPlantilla } from '@/features/fixed-expenses/period'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
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
  /** Bloque 3, sólo fijos "una vez al mes": TODO lo ya guardado en este período (con y sin
   *  movimiento) — sin capar contra el importe del fijo (mismo criterio que
   *  `FixedExpenseStatus.savedCents`). Una bolsa no guarda, así que este prop no aplica ahí. */
  alreadySavedCents?: number
  /** Follow-up: subconjunto de `alreadySavedCents` que además generó un movimiento — esa plata ya
   *  salió del saldo real, así que al pagar el movimiento nuevo sale sólo por la diferencia (o no se
   *  genera ninguno si ya está cubierto del todo). Ver `FixedExpenseStatus.savedMovementCents`. */
  alreadySavedMovementCents?: number
}

/**
 * El importe pagado puede diferir del de la plantilla (aumentos, ajustes) — este popup lo permite
 * en el momento de marcar como pagado.
 *
 * Fijo de una sola vez: prellenado con el importe actual y sin autofocus — el caso dominante es
 * "vino igual, confirmo", el autofocus en mobile levanta el teclado para nada. Bloque 3: además
 * tiene los chips Pagar/Guardar — "Guardar" registra que ya se apartó plata para este fijo.
 * Follow-up: ese guardado puede generar movimiento o no (switch, sólo con `movimientos-manuales` —
 * BASIC, que no tiene esa capacidad, siempre guarda "aparte" sin movimiento). Una bolsa no tiene
 * estos chips: ya se va cargando de a partes como gasto real, guardar "para" ella no aplica
 * (decisión del plan).
 *
 * Bolsa (`is_recurring`): cada carga es un importe distinto (la nafta de esta semana no cuesta lo
 * mismo que la de la semana pasada), así que arranca vacío y con autofocus — acá sí hay algo para
 * escribir.
 *
 * No anida ningún otro diálogo (a diferencia de BucketDetailDialog) — no hace
 * falta el filtro de "close" que esos dos necesitan para no cerrarse en cascada.
 */
export function MarkPaidDialog({
  open,
  onClose,
  fixedExpense,
  period,
  alreadyPaidCents = 0,
  alreadySavedCents = 0,
  alreadySavedMovementCents = 0,
}: MarkPaidDialogProps) {
  const isRecurring = fixedExpense.is_recurring
  const [mode, setMode] = useState<Mode>('pay')
  const isSaving = !isRecurring && mode === 'save'
  const [input, setInput] = useState(() => (isRecurring ? '' : centsToInputText(fixedExpense.cents)))
  const [note, setNote] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')
  const [occurredOn, setOccurredOn] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const markPaid = useMarkFixedExpensePaid()
  const addSaving = useAddFixedExpenseSaving()
  const picker = useAccountPicker()
  const canMovimientosManuales = useCan('movimientos-manuales')
  const [accountId, setAccountId] = useDefaultAccountId()
  // Prendido por default (decisión del usuario): guardar sí descuenta del saldo salvo que se apague
  // a propósito. En BASIC (sin `movimientos-manuales`) ni se muestra el switch — ese plan siempre
  // guarda "aparte", nunca genera movimiento (ver el guard más abajo y `handleConfirm`).
  const [generateMovement, setGenerateMovement] = useState(true)

  const bagPeriod = bagPeriodNoun(fixedExpense.bag_frequency)
  const cents = parseAmountToCents(input)
  const willUpdateTemplate = !isRecurring && !isSaving && permiteActualizarPlantilla(period, new Date())
  const differs = !isRecurring && !isSaving && cents != null && cents !== fixedExpense.cents
  // FI-12: cuánto falta, completa justo o sobra — informa el aviso bajo el importe (bolsa o guardado)
  // más abajo en el JSX.
  const amountCopy =
    cents != null && cents > 0
      ? isRecurring
        ? amountAfterCopy(fixedExpense.cents, alreadyPaidCents, cents)
        : isSaving
          ? amountAfterCopy(fixedExpense.cents, alreadySavedCents, cents)
          : null
      : null
  const isPending = markPaid.isPending || addSaving.isPending
  // FI-01/FI-11: candado síncrono además de `isPending` — un doble toque en mobile puede disparar el
  // segundo click antes de que React re-renderice el botón ya deshabilitado. Se libera en `onSettled`
  // (éxito o error), para no dejar el diálogo trabado si la mutación falla.
  const submittingRef = useRef(false)
  // El pago siempre puede llevar cuenta. El guardado sólo si además genera movimiento — si es "aparte"
  // no hay con qué pagarlo. Cuando se muestra, es obligatoria: el saldo es la suma de las cuentas.
  const showAccountField = picker.show && (!isSaving || (canMovimientosManuales && generateMovement))
  const accountMissing = showAccountField && !accountId
  // El campo Fecha sólo tiene sentido cuando de verdad se va a generar un movimiento — pagar una
  // bolsa/fijo siempre genera uno (o, con todo cubierto por guardados, ninguno, pero la fecha sigue
  // siendo la del pago); guardar "aparte" no.
  const showDateField = !isSaving || (canMovimientosManuales && generateMovement)
  // Una bolsa ubica su carga por `paid_at`, no por el `period` que le pasó el que abrió este diálogo
  // (el mes/quincena/semana EN CURSO al abrir) — si la fecha elegida cae en otro mes, la carga tiene
  // que quedar en el mes de esa fecha (ver `bag_cycle_from`/`bag_cycle_to` y el `period` que arma
  // `RegisterFixedExpenseDialog`/`Fijos.tsx`). Un fijo de una sola vez sigue usando el período que le
  // pasaron: pagar el de septiembre el 30/8 es válido y sigue siendo el pago de septiembre.
  const effectivePeriod = isRecurring && occurredOn ? format(startOfMonth(parseISO(occurredOn)), 'yyyy-MM-dd') : period

  // Lo guardado "aparte" (sin movimiento): informativo en el modo Pagar, pero nunca descuenta del
  // movimiento que genera el pago — esa plata todavía no salió de ningún lado.
  const asideSavedCents = alreadySavedCents - alreadySavedMovementCents
  // Lo que de verdad va a generar el pago, dado el importe que se está por confirmar — sólo se
  // conoce del lado del cliente para el aviso; el RPC hace este mismo cálculo de nuevo con lo que
  // haya en la base al momento de pagar (ver `rpc_mark_fixed_expense_paid`).
  const payTxAmount = !isRecurring && !isSaving && cents != null ? Math.max(cents - alreadySavedMovementCents, 0) : null

  function selectMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
    setDateError(null)
    // Pagar sugiere el importe del fijo (el caso dominante: "vino igual, confirmo") — Guardar
    // sugiere lo que todavía falta juntar, para que "guardar el resto" sea completar sin pensar.
    setInput(next === 'pay' ? centsToInputText(fixedExpense.cents) : centsToInputText(Math.max(fixedExpense.cents - alreadySavedCents, 0)))
  }

  function handleConfirm() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    if (showDateField && !occurredOn) {
      setDateError('Falta la fecha')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    const onSettled = () => {
      submittingRef.current = false
    }

    if (isSaving) {
      const savingWithMovement = canMovimientosManuales && generateMovement
      addSaving.mutate(
        {
          fixedExpenseId: fixedExpense.id,
          period,
          cents,
          // BASIC no tiene el switch (siempre `false` acá, ver el guard del JSX) — en el resto de los
          // planes manda lo que haya elegido el usuario.
          generateMovement: savingWithMovement,
          accountId: savingWithMovement ? accountId || null : null,
          occurredOn: savingWithMovement ? occurredOn : null,
        },
        { onSuccess: onClose, onSettled },
      )
    } else {
      markPaid.mutate(
        {
          fixedExpenseId: fixedExpense.id,
          period: effectivePeriod,
          cents,
          note: note.trim() || null,
          accountId: accountId || null,
          occurredOn,
        },
        { onSuccess: onClose, onSettled },
      )
    }
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
          <Button size="dialogFooter" onClick={handleConfirm} disabled={isPending || accountMissing}>
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
            <Chip size="lg" active={mode === 'pay'} onClick={() => selectMode('pay')}>
              Pagar
            </Chip>
            <Chip size="lg" active={mode === 'save'} onClick={() => selectMode('save')}>
              Guardar
            </Chip>
          </div>
        )}

        {!isRecurring && mode === 'pay' && asideSavedCents > 0 && (
          <p className="text-[12px] text-fg-muted">
            Tenés <Money cents={asideSavedCents} tone="dim" size="inline" /> guardado (aparte, sin movimiento) para este fijo.
          </p>
        )}

        {!isRecurring && mode === 'pay' && alreadySavedMovementCents > 0 && (
          <p className="text-[12px] text-fg-muted">
            {payTxAmount === 0 ? (
              <>
                Ya guardaste <Money cents={alreadySavedMovementCents} tone="dim" size="inline" /> con movimiento: no hace falta generar
                un movimiento nuevo.
              </>
            ) : (
              <>
                Ya guardaste <Money cents={alreadySavedMovementCents} tone="dim" size="inline" /> con movimiento: el pago genera un
                movimiento sólo por {payTxAmount != null ? <Money cents={payTxAmount} tone="dim" size="inline" /> : 'lo restante'}.
              </>
            )}
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

        {showDateField && (
          <Field label="Fecha" error={dateError ?? undefined}>
            <Input
              type="date"
              value={occurredOn}
              max={today}
              invalid={!!dateError}
              onChange={(e) => {
                setOccurredOn(e.target.value)
                setDateError(null)
              }}
            />
          </Field>
        )}

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

        {/* Follow-up: el guardado sólo genera movimiento si el plan tiene `movimientos-manuales` Y
            el usuario lo eligió acá — BASIC no llega a ver este bloque (siempre guarda "aparte"). */}
        {isSaving && canMovimientosManuales && (
          <label className="flex items-center gap-2.5 text-[13px] text-fg">
            <input
              type="checkbox"
              checked={generateMovement}
              onChange={(e) => setGenerateMovement(e.target.checked)}
              className="size-4 shrink-0 accent-accent"
            />
            Generar movimiento (descuenta del saldo ahora)
          </label>
        )}

        {showAccountField && (
          <Field label={isSaving ? 'Con qué lo guardé' : 'Con qué lo pagué'}>
            <AccountSelect required value={accountId} onChange={setAccountId} />
          </Field>
        )}

        {isRecurring && amountCopy && (
          <p className="text-[12px] text-fg-muted">
            {amountCopy.kind === 'remaining' && (
              <>
                Después de esta carga, falta <Money cents={amountCopy.cents} tone="dim" />.
              </>
            )}
            {amountCopy.kind === 'complete' && `Con esta carga completás el presupuesto ${bagPeriod.adjective}.`}
            {amountCopy.kind === 'over' && (
              <>
                Te pasás <Money cents={amountCopy.cents} tone="dim" /> del presupuesto {bagPeriod.adjective}.
              </>
            )}
          </p>
        )}

        {isSaving && amountCopy && (
          <p className="text-[12px] text-fg-muted">
            {amountCopy.kind === 'remaining' && (
              <>
                Después de esto, te falta guardar <Money cents={amountCopy.cents} tone="dim" />.
              </>
            )}
            {amountCopy.kind === 'complete' && 'Con esto lo tenés cubierto.'}
            {amountCopy.kind === 'over' && (
              <>
                Guardás <Money cents={amountCopy.cents} tone="dim" /> de más.
              </>
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
