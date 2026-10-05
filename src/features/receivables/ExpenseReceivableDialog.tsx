import { Dialog } from '@/components/ui/Dialog'
import { DialogConfirmStack } from '@/components/ui/dialog-parts'
import { Money } from '@/components/ui/Money'
import { formatMoney } from '@/lib/money'
import { useExpenseReceivable } from '@/features/receivables/api'
import type { ReceivableSummary } from '@/features/receivables/aggregate'
import { AccountField } from '@/features/accounts/AccountField'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'

interface ExpenseReceivableDialogProps {
  open: boolean
  onClose: () => void
  summary: ReceivableSummary
}

/**
 * "Registrar el gasto ahora" sobre una deuda cargada sin movimiento: `rpc_expense_receivable` crea
 * el gasto por lo pendiente, en «Préstamos» y con fecha de hoy, y prende `already_expensed`. Sólo
 * pide la cuenta (si la app la pide).
 */
export function ExpenseReceivableDialog({ open, onClose, summary }: ExpenseReceivableDialogProps) {
  const { receivable, pendingCents } = summary
  const expenseReceivable = useExpenseReceivable()
  const [accountId, setAccountId] = useDefaultAccountId()
  const picker = useAccountPicker()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar el gasto"
      footer={
        <DialogConfirmStack
          tone="primary"
          confirmLabel={`Registrar ${formatMoney(pendingCents)}`}
          pendingLabel="Guardando…"
          pending={expenseReceivable.isPending}
          disabled={picker.show && !accountId}
          onConfirm={() => expenseReceivable.mutate({ receivableId: receivable.id, accountId: accountId || null }, { onSuccess: onClose })}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-fg-secondary">
          Se carga un gasto en Préstamos por <Money cents={pendingCents} tone="fg" size="inline" />, lo que todavía te debe{' '}
          {receivable.name}. Cuando te lo devuelva, el cobro arranca registrando el ingreso.
        </p>
        {picker.show && <AccountField label="Con qué se lo diste" accountId={accountId} onChange={setAccountId} deltaCents={-pendingCents} />}
      </div>
    </Dialog>
  )
}
