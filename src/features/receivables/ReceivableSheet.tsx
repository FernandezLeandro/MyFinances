import { useRef, useState } from 'react'
import { m } from 'motion/react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { CountUpMoney, Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { DialogConfirmStack, DialogEmptyNote } from '@/components/ui/dialog-parts'
import { Field, AmountInput } from '@/components/ui/Input'
import { EASE_OUT_QUINT } from '@/lib/motion'
import { centsToInputText, formatMoney, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { AccountField } from '@/features/accounts/AccountField'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useDeleteReceivablePayment, useRegisterReceivablePayment, useUnexpenseReceivable } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'
import { estadoDeCobro } from '@/features/receivables/format'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ExpenseReceivableDialog } from '@/features/receivables/ExpenseReceivableDialog'

type View = 'detail' | 'cobrar'
type Child = 'edit' | 'expense' | null

interface ReceivableSheetProps {
  open: boolean
  onClose: () => void
  summary: ReceivableSummary
  /** `'cobrar'` desde el «+» de la fila: el panel abre directo en el cobro y, al confirmarlo, se
   *  cierra entero en vez de volver al detalle. */
  initialView?: View
}

/**
 * El panel de una deuda a favor — mismo arquetipo que `DebtSheet` de Mis Deudas: el detalle y el
 * cobro son dos vistas del mismo panel, sin diálogos encadenados. Sólo editar la deuda o registrar el
 * gasto abren un diálogo aparte, con el patrón de hijo de siempre (`open && child === null`, el hijo
 * montado como hermano): sin eso, el `close` nativo del `<dialog>` cerraría este panel de un tirón.
 */
export function ReceivableSheet({ open, onClose, summary, initialView = 'detail' }: ReceivableSheetProps) {
  const { receivable, payments, paidCents, pendingCents, cobrada } = summary
  const n = receivable.installments
  const [view, setView] = useState<View>(initialView)
  const [child, setChild] = useState<Child>(null)
  const [amountInput, setAmountInput] = useState(() => centsToInputText(summary.proximoCobroCents))
  // Arranca igual que se decidió al prestar: con gasto, el cobro es un ingreso; sin gasto, la plata
  // nunca salió del saldo y registrar un ingreso la contaría dos veces.
  const [createIncome, setCreateIncome] = useState(receivable.already_expensed)
  const [amountError, setAmountError] = useState<string | null>(null)
  const [accountId, setAccountId] = useDefaultAccountId()
  const picker = useAccountPicker()
  const submittingRef = useRef(false)

  const registerPayment = useRegisterReceivablePayment()
  const deletePayment = useDeleteReceivablePayment()
  const unexpense = useUnexpenseReceivable()

  const estado = estadoDeCobro(summary, new Date())
  const devueltoPct = receivable.amountCents > 0 ? Math.min((paidCents / receivable.amountCents) * 100, 100) : 0
  const cents = parseAmountToCents(amountInput)
  const accountMissing = createIncome && picker.show && !accountId

  function handleClose() {
    if (child === null) onClose()
  }

  function goCobrar() {
    setAmountInput(centsToInputText(summary.proximoCobroCents))
    setCreateIncome(receivable.already_expensed)
    setAmountError(null)
    setView('cobrar')
  }

  function leaveCobrar() {
    if (initialView === 'cobrar') onClose()
    else setView('detail')
  }

  function confirmCobro() {
    if (cents == null || cents <= 0 || cents >= MAX_AMOUNT_CENTS) {
      setAmountError('Ingresá un importe válido')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    registerPayment.mutate(
      { receivableId: receivable.id, cents, createIncome, accountId: createIncome ? accountId || null : null },
      {
        onSuccess: leaveCobrar,
        onSettled: () => {
          submittingRef.current = false
        },
      },
    )
  }

  const progreso =
    n > 1
      ? `Cobraste ${summary.cuotasCobradas} de ${n} cuotas`
      : paidCents > 0
        ? `Te devolvió ${formatMoney(paidCents)} de ${formatMoney(receivable.amountCents)}`
        : 'Todavía no te devolvió nada'

  return (
    <>
      <Dialog
        open={open && child === null}
        onClose={handleClose}
        title={view === 'cobrar' ? `Cobrar a ${receivable.name}` : receivable.name}
        subtitle={view === 'detail' ? estado.text : undefined}
        onBack={view === 'cobrar' && initialView === 'detail' ? () => setView('detail') : undefined}
        footer={
          view === 'cobrar' ? (
            <DialogConfirmStack
              tone="primary"
              confirmLabel={cents != null && cents > 0 ? `Cobrar ${formatMoney(cents)}` : 'Cobrar'}
              pendingLabel="Guardando…"
              pending={registerPayment.isPending}
              disabled={accountMissing}
              onConfirm={confirmCobro}
              onCancel={leaveCobrar}
            />
          ) : cobrada ? undefined : (
            <Button size="dialogFooter" className="sm:h-[52px]! sm:w-full!" onClick={goCobrar}>
              Cobrar {formatMoney(summary.proximoCobroCents)}
            </Button>
          )
        }
      >
        {/* Ir a cobrar desliza desde la derecha y volver, desde la izquierda — sólo la entrada (180ms),
            mismos valores que `DebtSheet`. */}
        <m.div
          key={view}
          initial={{ opacity: 0, transform: `translateX(${view === 'cobrar' ? 12 : -12}px)` }}
          animate={{ opacity: 1, transform: 'translateX(0px)' }}
          transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
        >
          {view === 'detail' ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="eyebrow">{cobrada ? 'Cobrada' : 'Te debe'}</p>
                  <button type="button" onClick={() => setChild('edit')} className="text-[12.5px] font-semibold text-accent-text hover:underline">
                    Editar deuda
                  </button>
                </div>
                <CountUpMoney cents={cobrada ? receivable.amountCents : pendingCents} tone={cobrada ? 'dim' : 'fg'} size="figure" className="mt-1" />
                <StackedBar thin className="mt-3" segments={[{ pct: devueltoPct, color: 'var(--color-accent)' }]} />
                <p className="mt-2 text-[12.5px] text-fg-muted">
                  {progreso}
                  {n > 1 && (
                    <>
                      {' · '}
                      {formatMoney(paidCents)} de {formatMoney(receivable.amountCents)}
                    </>
                  )}
                </p>
                {estado.vencido && <p className="mt-1 text-[12.5px] font-semibold text-negative">{estado.text}</p>}
              </div>

              {receivable.note && <p className="text-[13px] text-fg-secondary">{receivable.note}</p>}

              {!cobrada && !receivable.already_expensed && (
                <button type="button" onClick={() => setChild('expense')} className="self-start text-[12.5px] font-semibold text-accent-text hover:underline">
                  Registrar el gasto ahora
                </button>
              )}
              {receivable.expense_transaction_id != null && (
                <p className="text-[12.5px] text-fg-muted">
                  Se registró un gasto en Préstamos.{' '}
                  <button
                    type="button"
                    onClick={() => unexpense.mutate(receivable.id)}
                    disabled={unexpense.isPending}
                    className="font-semibold text-accent-text hover:underline disabled:opacity-40"
                  >
                    {unexpense.isPending ? 'Deshaciendo…' : 'Deshacer'}
                  </button>
                </p>
              )}

              <div>
                <p className="eyebrow">Abonos</p>
                {payments.length === 0 ? (
                  <div className="mt-3">
                    <DialogEmptyNote>Todavía no te devolvió nada.</DialogEmptyNote>
                  </div>
                ) : (
                  <ul className="-mx-panel mt-1 flex max-h-[40vh] flex-col overflow-y-auto">
                    {payments.map((payment) => (
                      <li key={payment.id} className="flex items-center gap-3 border-t border-divider px-panel py-2.5 first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-fg-secondary">{format(parseISO(payment.occurred_on), "d 'de' MMMM", { locale: es })}</p>
                          {payment.transaction_id && <p className="mt-0.5 text-[11.5px] text-fg-muted">Con ingreso en Préstamos</p>}
                        </div>
                        <Money cents={payment.amountCents} tone="dim" size="row" />
                        <button
                          type="button"
                          onClick={() => deletePayment.mutate(payment.id)}
                          disabled={deletePayment.isPending}
                          aria-label={`Quitar el abono de ${formatMoney(payment.amountCents)}`}
                          className="grid size-8 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                        >
                          <X className="size-3.5" strokeWidth={1.8} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <Field label="Te devolvió" error={amountError ?? undefined}>
                <AmountInput
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value)
                    setAmountError(null)
                  }}
                  invalid={!!amountError}
                  autoFocus
                />
              </Field>
              <p className="-mt-3 text-[12.5px] text-fg-muted">
                {cents != null && cents >= pendingCents ? 'Con esto la deuda queda saldada.' : `Te debe ${formatMoney(pendingCents)} en total.`}
              </p>

              <label className="flex items-center gap-2.5 text-[13px] text-fg">
                <input
                  type="checkbox"
                  checked={createIncome}
                  onChange={(e) => setCreateIncome(e.target.checked)}
                  className="size-4 shrink-0 accent-accent"
                />
                Registrar el ingreso en Préstamos
              </label>
              {createIncome !== receivable.already_expensed && (
                <p className="-mt-3 text-[12px] text-negative">
                  {createIncome
                    ? 'Al prestar no registraste el gasto: este ingreso contaría esa plata dos veces.'
                    : 'Al prestar registraste el gasto: sin el ingreso, tu saldo queda corto.'}
                </p>
              )}

              {createIncome && picker.show && (
                <AccountField label="Dónde entró" accountId={accountId} onChange={setAccountId} deltaCents={cents} />
              )}
            </div>
          )}
        </m.div>
      </Dialog>

      {child === 'edit' && <ReceivableFormDialog open onClose={() => setChild(null)} receivable={receivable} onDeleted={onClose} />}
      {child === 'expense' && <ExpenseReceivableDialog open onClose={() => setChild(null)} summary={summary} />}
    </>
  )
}
