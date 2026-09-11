import { useState } from 'react'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Money } from '@/components/ui/Money'
import { useCategories } from '@/features/categories/api'
import { useExpenseReceivable } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'

interface ExpenseReceivableDialogProps {
  open: boolean
  onClose: () => void
  summary: ReceivableSummary
}

/**
 * "Descontala ahora" sobre una deuda que se había cargado como "sigue en mi saldo": pide categoría
 * y fecha del gasto y llama a `useExpenseReceivable`, que via `rpc_expense_receivable` crea el gasto
 * por lo pendiente y prende `already_expensed`. Compartido por `ReceivableDetailDialog` (el detalle
 * de una deuda) y `CuadrarSaldoDialog` (sacar una deuda del cuadre sin ir a Movimientos) — mismos
 * dos puntos de entrada que ya comparten `RegistrarAbonoDialog`.
 */
export function ExpenseReceivableDialog({ open, onClose, summary }: ExpenseReceivableDialogProps) {
  const { receivable, pendingCents } = summary
  const { data: categories } = useCategories()
  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense')

  const [categoryId, setCategoryId] = useState('')
  const [occurredOn, setOccurredOn] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const expenseReceivable = useExpenseReceivable()
  const [accountId, setAccountId] = useDefaultAccountId()

  async function handleConfirm() {
    await expenseReceivable.mutateAsync({
      receivableId: receivable.id,
      categoryId: categoryId || null,
      occurredOn,
      accountId: accountId || null,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Descontar de tu saldo"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleConfirm} disabled={expenseReceivable.isPending}>
            {expenseReceivable.isPending ? 'Guardando…' : 'Descontar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">{receivable.name}</p>
          <p className="mt-1 text-[13px] text-fg-muted">
            Se carga un gasto por <Money cents={pendingCents} tone="dim" /> — lo que todavía te debe.
          </p>
        </div>

        <Field label="Categoría" htmlFor="expenseCategoryId" hint="Opcional">
          <Select id="expenseCategoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Elegir…</option>
            {expenseCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" htmlFor="expenseOccurredOn">
          <Input
            id="expenseOccurredOn"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>

        <Field label="Con qué lo pagué" hint="Opcional">
          <AccountSelect value={accountId} onChange={setAccountId} />
        </Field>

        <p className="text-[12px] text-fg-muted">
          Esa plata deja de contar como tuya en Cuadrar saldo — cuando te la devuelvan se va a
          registrar como un ingreso.
        </p>
      </div>
    </Dialog>
  )
}
