import { useState } from 'react'
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
 */
export function AssignIncomeDialog({ open, onClose, cycleFrom, cycleTo, cycleLabel }: AssignIncomeDialogProps) {
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: incomes, isPending } = useTransactions({ from: cycleFrom, to: cycleTo, type: 'income' })
  const addIncome = useCreateTransaction()
  const removeIncome = useDeleteTransaction()
  // MO-01 del QA de Movimientos: la ✕ borraba al instante, sin confirmar ni deshacer — mismo
  // problema que ya se arregló en Movimientos, con el mismo diálogo.
  const [pendingRemove, setPendingRemove] = useState<Transaction | null>(null)

  const totalCents = (incomes ?? []).reduce((acc, tx) => acc + tx.cents, 0)
  const cents = parseAmountToCents(input)

  async function handleAdd() {
    if (cents == null || cents <= 0) {
      setError('Ingresá un importe válido')
      return
    }
    await addIncome.mutateAsync({
      type: 'income',
      cents,
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      categoryId: null,
      description: note.trim() || 'Sueldo',
    })
    setInput('')
    setNote('')
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Asignar sueldo — ${cycleLabel}`}>
        <div className="flex flex-col gap-5">
          {totalCents > 0 && (
            <div>
              <p className="eyebrow">Asignado este ciclo</p>
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
            <p className="eyebrow mb-3">Asignaciones de este ciclo</p>
            {isPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !incomes || incomes.length === 0 ? (
              <EmptyState glyph="◷" title="Todavía no asignaste nada este ciclo" />
            ) : (
              <ul className="-mx-panel flex max-h-[35vh] flex-col overflow-y-auto">
                {incomes.map((income) => (
                  <li key={income.id} className="flex items-center gap-3 px-panel py-2">
                    <p className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
                      {format(parseISO(income.occurred_on), "d 'de' MMMM", { locale: es })}
                      {income.description ? ` · ${income.description}` : ''}
                    </p>
                    <Money cents={income.cents} tone="dim" size="inline" />
                    <button
                      type="button"
                      onClick={() => setPendingRemove(income)}
                      disabled={removeIncome.isPending}
                      aria-label="Quitar esta asignación"
                      className="grid size-6 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                    >
                      <X className="size-3" strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                ))}
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
