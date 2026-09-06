import { Money } from '@/components/ui/Money'
import { etiquetaCuota } from '@/features/credits/format'
import type { MisDeudasSummary } from '@/features/credits/aggregate'

interface StandalonePurchaseRowProps {
  summary: MisDeudasSummary['standalone'][number]
  isCurrentMonth: boolean
  onEdit: () => void
  onMarkPaid: () => void
  onUnmarkPaid: () => void
}

/** Fila de una compra a crédito sin tarjeta — deliberadamente NO un `Panel` tipo tarjeta (a
 *  diferencia de `CardCard`): una compra suelta es un ítem individual, no un grupo, así que se ve
 *  como una fila de lista, igual que `ReceivableRow` en Me Deben. */
export function StandalonePurchaseRow({ summary, isCurrentMonth, onEdit, onMarkPaid, onUnmarkPaid }: StandalonePurchaseRowProps) {
  const { purchase, item, totalCents, paid } = summary
  const vencido = isCurrentMonth && !paid && new Date().getDate() > (purchase.due_day ?? 32)

  return (
    <li className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-fill-subtle">
      <button type="button" onClick={onEdit} aria-label={`${purchase.description}: editar`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-fg">
            {purchase.description} <span className="text-fg-muted">{etiquetaCuota(item.installment_no, item.installments)}</span>
          </p>
          <p className="mt-0.5 text-[12px]">
            {paid ? (
              <span className="font-medium text-accent">Pagada este mes</span>
            ) : (
              <span className={vencido ? 'text-negative' : 'text-fg-muted'}>
                {vencido ? `Venció el ${purchase.due_day}` : `Vence el ${purchase.due_day}`}
              </span>
            )}
          </p>
        </div>
      </button>

      <Money cents={totalCents} tone={paid ? 'dim' : 'accent'} />

      {paid ? (
        <button
          type="button"
          onClick={onUnmarkPaid}
          className="shrink-0 rounded-chip px-2 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-fg"
        >
          Desmarcar
        </button>
      ) : (
        <button
          type="button"
          onClick={onMarkPaid}
          className="shrink-0 rounded-chip bg-fill-subtle px-2 py-1 text-[12px] text-fg-muted transition-colors duration-150 hover:bg-border-strong hover:text-fg"
        >
          Marcar pagada
        </button>
      )}
    </li>
  )
}
