import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { parseAmountToCents } from '@/lib/money'
import { useCreateTransaction, useDeleteTransaction, useTransactions, type Transaction } from '@/features/transactions/api'
import { ConfirmDeleteMovementDialog } from '@/features/transactions/ConfirmDeleteMovementDialog'
import { confirmDeleteMovementCopy } from '@/features/transactions/aggregate'
import { isCycleIncome, isRemovableFromDialog } from './aggregate'

interface AssignIncomeDialogProps {
  open: boolean
  onClose: () => void
  cycleFrom: string
  cycleTo: string
  /** "septiembre" / "1–15 sep" — mismo copy que ya usa `FijosCicloCard` para el ciclo. */
  cycleLabel: string
}

/**
 * BASIC no registra movimientos manuales, así que no tiene otra forma de saber cuánta plata cobró
 * este ciclo — este diálogo es ese único lugar, separado a propósito de "Nuevo movimiento" (acá no
 * hay categoría ni cuenta que elegir, sólo importe y detalle). A diferencia de "guardar para un
 * fijo" (que deliberadamente NO genera movimiento — no es plata real todavía), un sueldo cobrado sí
 * es plata real: entra como un movimiento de tipo `income` más, sin categoría, así aparece en
 * Movimientos y suma al saldo/proyectado igual que cualquier ingreso — no hace falta una tabla
 * aparte para esto (ver `useCreateTransaction`).
 *
 * HO-10/HO-11 del QA de Hoy (D1, 2026-09-24): la lista y el total son «Ingresos del ciclo» — TODO
 * ingreso no-ajuste, no sólo lo cargado acá (`isCycleIncome`, la misma regla que `v_range_summary` y
 * que usa la tarjeta de `FijosCicloCard`) — así las dos pantallas siempre muestran el mismo número.
 * Una fila que no nació en este diálogo (con categoría, o de pagar un fijo) se lista sin X, con
 * «cargado desde Movimientos»: se edita o se borra desde ahí, no acá.
 */
export function AssignIncomeDialog({ open, onClose, cycleFrom, cycleTo, cycleLabel }: AssignIncomeDialogProps) {
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: allIncomeType, isPending } = useTransactions({ from: cycleFrom, to: cycleTo, type: 'income' })
  const incomes = (allIncomeType ?? []).filter(isCycleIncome)
  const addIncome = useCreateTransaction()
  const removeIncome = useDeleteTransaction()
  // MO-01 del QA de Movimientos: la ✕ borraba al instante, sin confirmar ni deshacer — mismo
  // problema que ya se arregló en Movimientos, con el mismo diálogo.
  const [pendingRemove, setPendingRemove] = useState<Transaction | null>(null)
  // HO-13: candado síncrono además de `addIncome.isPending` — un doble click (o dos toques rápidos
  // en mobile) puede disparar el segundo antes de que React re-renderice el botón ya deshabilitado.
  // Mismo patrón que FI-01/FI-11 en `MarkPaidDialog`. Se libera en `onSettled`, para no dejar el
  // diálogo trabado si la mutación falla.
  const submittingRef = useRef(false)

  const totalCents = incomes.reduce((acc, tx) => acc + tx.cents, 0)
  const cents = parseAmountToCents(input)

  function handleAdd() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    if (submittingRef.current) return
    submittingRef.current = true
    addIncome.mutate(
      {
        type: 'income',
        cents,
        occurredOn: format(new Date(), 'yyyy-MM-dd'),
        categoryId: null,
        description: note.trim() || 'Sueldo',
      },
      {
        onSuccess: () => {
          setInput('')
          setNote('')
        },
        onSettled: () => {
          submittingRef.current = false
        },
      },
    )
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Asignar sueldo — ${cycleLabel}`}>
        <div className="flex flex-col gap-5">
          {totalCents > 0 && (
            <div>
              <p className="eyebrow">Ingresos del ciclo</p>
              <Money cents={totalCents} tone="fg" size="figure" className="mt-1" />
            </div>
          )}

          <Field label="Importe" error={error ?? undefined}>
            <AmountInput
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
              }}
              invalid={!!error}
              autoFocus
            />
          </Field>

          <Field label="Detalle" hint="Opcional">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sueldo, adelanto…"
              maxLength={80}
            />
          </Field>

          <Button onClick={handleAdd} disabled={addIncome.isPending} className="self-start">
            {addIncome.isPending ? 'Guardando…' : 'Agregar'}
          </Button>

          <div>
            <p className="eyebrow mb-3">Ingresos de este ciclo</p>
            {isPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : incomes.length === 0 ? (
              <EmptyState glyph="◷" title="Todavía no asignaste nada este ciclo" />
            ) : (
              <ul className="-mx-panel flex max-h-[35vh] flex-col overflow-y-auto">
                {incomes.map((income) => {
                  const removable = isRemovableFromDialog(income)
                  return (
                    <li key={income.id} className="flex items-center gap-3 px-panel py-2">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
                        {format(parseISO(income.occurred_on), "d 'de' MMMM", { locale: es })}
                        {income.description ? ` · ${income.description}` : ''}
                        {!removable && ' · cargado desde Movimientos'}
                      </p>
                      <Money cents={income.cents} tone="dim" size="inline" />
                      {removable ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemove(income)}
                          disabled={removeIncome.isPending}
                          aria-label="Quitar esta asignación"
                          className="grid size-6 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                        >
                          <X className="size-3" strokeWidth={1.5} aria-hidden />
                        </button>
                      ) : (
                        <span className="size-6 shrink-0" aria-hidden />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </Dialog>
      <ConfirmDeleteMovementDialog
        open={!!pendingRemove}
        busy={removeIncome.isPending}
        copy={confirmDeleteMovementCopy({ kind: 'plain', description: pendingRemove?.description ?? null })}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return
          removeIncome.mutate(pendingRemove.id, { onSuccess: () => setPendingRemove(null) })
        }}
      />
    </>
  )
}
