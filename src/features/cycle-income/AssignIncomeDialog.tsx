import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Coins, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { DialogEmptyNote } from '@/components/ui/dialog-parts'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoney, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
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
 *
 * Rediseño de modales v2 (S1): el formulario arriba — importe centrado y un botón «Agregar $X» a todo
 * el ancho — y la lista del ciclo debajo, con la ficha de cada ingreso.
 */
export function AssignIncomeDialog({ open, onClose, cycleFrom, cycleTo, cycleLabel }: AssignIncomeDialogProps) {
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: allIncomeType, isPending } = useTransactions({ from: cycleFrom, to: cycleTo, type: 'income' })
  const incomes = (allIncomeType ?? []).filter(isCycleIncome)
  const { data: categories } = useCategories(true)
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
            <div className="flex items-center gap-3 rounded-float bg-surface-sunken px-4 py-3">
              <span className="min-w-0 flex-1 text-[13px] text-fg-secondary">Ya asignaste en {cycleLabel}</span>
              <Money cents={totalCents} tone="fg" size="inline" />
            </div>
          )}

          <OpeningAmountField
            size="lg"
            align="center"
            allowNegative={false}
            autoFocus
            label="¿Cuánto entra?"
            ariaLabel="Importe"
            error={error ?? undefined}
            value={input}
            onChange={(v) => {
              setInput(v)
              setError(null)
            }}
          />

          <Field label="Detalle" hint="Opcional">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sueldo, adelanto…"
              maxLength={80}
            />
          </Field>

          <Button onClick={handleAdd} disabled={addIncome.isPending} className="h-[54px] w-full">
            {addIncome.isPending ? 'Guardando…' : cents != null && cents > 0 ? `Agregar ${formatMoney(cents)}` : 'Agregar'}
          </Button>

          <div className="flex flex-col gap-2">
            <p className="eyebrow">Ingresos de este ciclo</p>
            {isPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : incomes.length === 0 ? (
              <DialogEmptyNote icon={<Coins />}>Todavía no asignaste nada este ciclo</DialogEmptyNote>
            ) : (
              <ul className="flex flex-col rounded-panel-sm border border-border">
                {incomes.map((income) => {
                  const removable = isRemovableFromDialog(income)
                  const category = (categories ?? []).find((c) => c.id === income.category_id)
                  return (
                    <li key={income.id} className="flex items-center gap-3 border-b border-divider-list py-2 pr-2 pl-3 last:border-b-0">
                      <CategoryChip {...chipLook(category)} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-fg">{income.description || 'Ingreso'}</p>
                        <p className="truncate text-[12px] text-fg-secondary">
                          {format(parseISO(income.occurred_on), "d 'de' MMMM", { locale: es })}
                          {!removable && ' · cargado desde Movimientos'}
                        </p>
                      </div>
                      <Money cents={income.cents} tone="fg" size="inline" />
                      {removable ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemove(income)}
                          disabled={removeIncome.isPending}
                          aria-label="Quitar esta asignación"
                          className="grid size-8 shrink-0 place-items-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                        >
                          <X className="size-3.5" strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : (
                        <span className="size-8 shrink-0" aria-hidden />
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
        transaction={pendingRemove}
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
