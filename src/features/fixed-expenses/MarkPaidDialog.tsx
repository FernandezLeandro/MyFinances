import { useRef, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { FieldButton } from '@/components/ui/FieldButton'
import { centsToInputText, formatMoney, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { useAddFixedExpenseSaving, useMarkFixedExpensePaid, type FixedExpense } from '@/features/fixed-expenses/api'
import { amountAfterCopy } from '@/features/fixed-expenses/aggregate'
import { bagPeriodNoun, permiteActualizarPlantilla } from '@/features/fixed-expenses/period'
import { AccountSelect, AccountTriggerRow } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { useCan } from '@/features/access/useCan'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'

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
  /** Subconjunto de `alreadySavedCents` que el pago descuenta (con movimiento, o aparte por quien pudo
   *  elegir): al pagar, el movimiento nuevo sale sólo por la diferencia (o no se genera ninguno si ya
   *  está cubierto del todo). Ver `FixedExpenseStatus.coveredCents`. */
  alreadyCoveredCents?: number
  /** Vencimiento materializado de ESTA instancia (`'yyyy-MM-dd'`, `null` en una bolsa) — ya lo trae
   *  calculado el `FixedExpenseStatus` de quien abre el diálogo (`summarizeFixedExpenses`); no se
   *  rederiva acá. Header rediseño v2: "vence el D de mes" en el subtítulo. */
  dueDate?: string | null
}

/**
 * El importe pagado puede diferir del de la plantilla (aumentos, ajustes) — este popup lo permite
 * en el momento de marcar como pagado.
 *
 * Rediseño de modales v2 (Pagar fijo, `PF-Pay`): header a banda con la categoría del fijo (`Dialog`
 * prop `tint`), importe centrado y un campo-botón de fecha y de cuenta. El toggle Pagar/Guardar de
 * antes pasa a un texto al pie («Sólo guardar plata para este fijo» / «Pagar este fijo»,
 * `selectMode` sin cambios) — una bolsa no lo tiene, no aplica guardar "para" ella.
 *
 * Fijo de una sola vez: prellenado con el importe actual y sin autofocus — el caso dominante es
 * "vino igual, confirmo", el autofocus en mobile levanta el teclado para nada. Follow-up: ese
 * guardado puede generar movimiento o no (switch, sólo con `movimientos-manuales` — BASIC, que no
 * tiene esa capacidad, siempre guarda "aparte" sin movimiento).
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
  alreadyCoveredCents = 0,
  dueDate = null,
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
  const dateInputRef = useRef<HTMLInputElement>(null)

  const { data: categories } = useCategories(true)
  const category = (categories ?? []).find((c) => c.id === fixedExpense.category_id) ?? null
  const look = chipLook(category ?? undefined)
  // Sólo una categoría real tiñe el header — la ficha neutra "sin categoría" es gris de por sí.
  const tint = 'color' in look ? look.color : undefined

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
  // Lo que de verdad va a generar el pago, dado el importe que se está por confirmar — sólo se
  // conoce del lado del cliente para el aviso; el RPC hace este mismo cálculo de nuevo con lo que
  // haya en la base al momento de pagar (ver `rpc_mark_fixed_expense_paid`). Se calcula acá arriba
  // (antes se calculaba más abajo, sólo para el copy) porque `showAccountField` también lo necesita
  // — FI-24.
  const payTxAmount = !isRecurring && !isSaving && cents != null ? Math.max(cents - alreadyCoveredCents, 0) : null
  // El pago siempre puede llevar cuenta — salvo que ya esté TODO cubierto por guardados con
  // movimiento (FI-24 del QA de Fijos: `payTxAmount === 0` no genera ningún movimiento nuevo, así que
  // pedir "Con qué lo pagué" no tiene con qué completarse). El guardado sólo pide cuenta si además
  // genera movimiento — si es "aparte" no hay con qué pagarlo. Cuando se muestra, es obligatoria: el
  // saldo es la suma de las cuentas.
  const showAccountField = picker.show && payTxAmount !== 0 && (!isSaving || (canMovimientosManuales && generateMovement))
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

  // Lo guardado que el pago NO descuenta (el aparte de BASIC, o de antes de que el aparte descontara):
  // informativo en el modo Pagar — el pago genera el importe completo.
  const asideSavedCents = alreadySavedCents - alreadyCoveredCents
  // BASIC no tiene el switch (siempre `false`, ver el guard del JSX) — en el resto de los planes
  // manda lo que haya elegido el usuario. Se calcula acá (no sólo adentro de `handleConfirm`) porque
  // el campo-botón de cuenta también lo necesita para el "queda en $…".
  const savingWithMovement = canMovimientosManuales && generateMovement
  // Lo que de verdad se descuenta de la cuenta elegida — para el "queda en $…" del campo-botón de
  // cuenta. Una bolsa siempre genera movimiento por el importe cargado; guardar "aparte" no debita
  // nada (`null`).
  const debitCents = isRecurring ? cents : isSaving ? (savingWithMovement ? cents : null) : payTxAmount

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
    // FI-18: mismo tope que el alta del fijo — sin esto, 11 cifras tiraban el error genérico de la
    // base en vez de uno claro acá.
    if (cents == null || cents <= 0 || cents >= MAX_AMOUNT_CENTS) {
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
      addSaving.mutate(
        {
          fixedExpenseId: fixedExpense.id,
          period,
          cents,
          // BASIC no tiene el switch (siempre `false` acá, ver el guard del JSX) — en el resto de los
          // planes manda lo que haya elegido el usuario.
          generateMovement: savingWithMovement,
          // Quien pudo elegir descuenta del pago todo lo guardado, con o sin movimiento; BASIC no
          // (guarda todo aparte: si descontara, el pago no generaría el gasto).
          coversPayment: canMovimientosManuales,
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

  const verb = isRecurring ? 'Registrar' : isSaving ? 'Guardar' : 'Pagar'
  const primaryLabel = isPending ? 'Guardando…' : cents != null && cents > 0 ? `${verb} ${formatMoney(cents)}` : verb

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={fixedExpense.name}
      subtitle={
        isRecurring ? (
          <>
            <Money cents={alreadyPaidCents} tone="dim" size="inline" /> de <Money cents={fixedExpense.cents} tone="dim" size="inline" />{' '}
            {bagPeriod.thisPeriod}
          </>
        ) : (
          `${category?.name ?? 'Sin categoría'}${dueDate ? ` · vence el ${format(parseISO(dueDate), "d 'de' MMM", { locale: es })}` : ''}`
        )
      }
      icon={<CategoryChip {...look} size={40} />}
      tint={tint}
      footerBleed
      footer={
        <div className="flex w-full flex-col gap-1 px-panel pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Button size="dialogFooter" className="sm:h-[52px]! sm:w-full!" onClick={handleConfirm} disabled={isPending || accountMissing}>
            {primaryLabel}
          </Button>
          {/* Sólo fijos de una sola vez: una bolsa siempre "registra una carga" (paga), no tiene
              sentido "guardar para" un presupuesto que ya se va gastando de a partes. Reemplaza los
              chips Pagar/Guardar de antes — mismo `selectMode`, disparado desde acá. */}
          {!isRecurring && (
            <button
              type="button"
              onClick={() => selectMode(mode === 'pay' ? 'save' : 'pay')}
              className="h-11 text-[13.5px] font-semibold text-fg-secondary hover:text-fg"
            >
              {mode === 'pay' ? 'Sólo guardar plata para este fijo' : 'Pagar este fijo'}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <OpeningAmountField
            size="lg"
            align="center"
            allowNegative={false}
            autoFocus={isRecurring}
            label={isRecurring ? 'Importe de esta carga' : isSaving ? 'Vas a guardar' : 'Vas a pagar'}
            ariaLabel={isRecurring ? 'Importe de esta carga' : isSaving ? 'Importe guardado' : 'Importe pagado'}
            error={error ?? undefined}
            value={input}
            onChange={(value) => {
              setInput(value)
              setError(null)
            }}
          />

          {!isRecurring && mode === 'pay' && asideSavedCents > 0 && (
            <p className="text-center text-[12px] text-fg-muted">
              Tenés <Money cents={asideSavedCents} tone="dim" size="inline" /> guardado aparte para este fijo.
            </p>
          )}

          {!isRecurring && mode === 'pay' && alreadyCoveredCents > 0 && (
            <p className="text-center text-[12px] text-fg-muted">
              {payTxAmount === 0 ? (
                <>
                  Ya guardaste <Money cents={alreadyCoveredCents} tone="dim" size="inline" />: no hace falta generar un movimiento
                  nuevo.
                </>
              ) : (
                <>
                  Ya guardaste <Money cents={alreadyCoveredCents} tone="dim" size="inline" />: el pago genera un movimiento sólo
                  por {payTxAmount != null ? <Money cents={payTxAmount} tone="dim" size="inline" /> : 'lo restante'}.
                </>
              )}
            </p>
          )}

          {isRecurring && amountCopy && (
            <p className="text-center text-[12px] text-fg-muted">
              {amountCopy.kind === 'remaining' && (
                <>
                  Después de esta carga, falta <Money cents={amountCopy.cents} tone="dim" size="inline" />.
                </>
              )}
              {amountCopy.kind === 'complete' && `Con esta carga completás el presupuesto ${bagPeriod.adjective}.`}
              {amountCopy.kind === 'over' && (
                <>
                  Te pasás <Money cents={amountCopy.cents} tone="dim" size="inline" /> del presupuesto {bagPeriod.adjective}.
                </>
              )}
            </p>
          )}

          {isSaving && amountCopy && (
            <p className="text-center text-[12px] text-fg-muted">
              {amountCopy.kind === 'remaining' && (
                <>
                  Después de esto, te falta guardar <Money cents={amountCopy.cents} tone="dim" size="inline" />.
                </>
              )}
              {amountCopy.kind === 'complete' && 'Con esto lo tenés cubierto.'}
              {amountCopy.kind === 'over' && (
                <>
                  Guardás <Money cents={amountCopy.cents} tone="dim" size="inline" /> de más.
                </>
              )}
            </p>
          )}

          {differs && (
            <p className="text-center text-[12px] text-fg-muted">
              {willUpdateTemplate
                ? 'El importe del fijo pasa a este valor de acá en adelante.'
                : 'Estás marcando un mes pasado — el importe del fijo no se toca.'}
            </p>
          )}
        </div>

        {showDateField && (
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Fecha</p>
            <FieldButton
              icon={<Calendar className="size-[18px]" strokeWidth={1.8} aria-hidden />}
              label={format(parseISO(occurredOn), "d 'de' MMM", { locale: es })}
              value={occurredOn === today ? 'hoy' : undefined}
              onClick={() => {
                const el = dateInputRef.current
                if (el && typeof el.showPicker === 'function') el.showPicker()
                else el?.focus()
              }}
            />
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              tabIndex={-1}
              aria-label="Fecha"
              max={today}
              value={occurredOn}
              onChange={(e) => {
                if (!e.target.value) return
                setOccurredOn(e.target.value)
                setDateError(null)
              }}
            />
            {dateError && (
              <p role="alert" className="text-[12.5px] font-medium text-badge-red-fg">
                {dateError}
              </p>
            )}
          </div>
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
          <div className="flex flex-col gap-2">
            <p className="eyebrow">{isSaving ? 'Con qué lo guardé' : 'Con qué lo pagás'}</p>
            <AccountSelect
              required
              value={accountId}
              onChange={setAccountId}
              trigger={(account) => (
                <AccountTriggerRow
                  icon={account?.icon ?? <span aria-hidden className="size-10 shrink-0 rounded-control bg-fill-subtle" />}
                  name={account?.name ?? 'Elegí una cuenta'}
                  placeholder={!account}
                  secondary={
                    account && debitCents != null && account.balanceCents !== undefined
                      ? `queda en ${formatMoney(account.balanceCents - debitCents)}`
                      : undefined
                  }
                />
              )}
              triggerClassName="flex h-[54px] w-full items-center gap-2.5 rounded-control border border-border-strong pr-3 pl-2 text-left text-fg transition-colors duration-150 hover:border-fg-faint"
            />
          </div>
        )}
      </div>
    </Dialog>
  )
}
