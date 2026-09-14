import { parseISO } from 'date-fns'
import { Check, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { IconSquare } from '@/components/ui/IconSquare'
import { Money } from '@/components/ui/Money'
import { fixedExpenseUrgency } from '@/features/fixed-expenses/aggregate'
import { etiquetaCuota } from '@/features/credits/format'
import type { MisDeudasSummary } from '@/features/credits/aggregate'

interface StandalonePurchaseRowProps {
  summary: MisDeudasSummary['standalone'][number]
  isCurrentMonth: boolean
  hidden: boolean
  categoryColor: string | undefined
  categoryName: string | undefined
  onEdit: () => void
  onMarkPaid: () => void
  onUnmarkPaid: () => void
}

/** Fila de una compra a crédito sin tarjeta — mismo idioma visual que `FixedExpenseRow` (Fijos): un
 *  `IconSquare` de acción a la izquierda, punto de categoría + texto al medio, badge de urgencia y
 *  el importe a la derecha. Antes era una fila más simple con botones de texto — se alinea acá para
 *  que Fijos y Mis Deudas, que comparten pregunta ("qué falta pagar este mes"), se lean como una
 *  sola familia. */
export function StandalonePurchaseRow({
  summary,
  isCurrentMonth,
  hidden,
  categoryColor,
  categoryName,
  onEdit,
  onMarkPaid,
  onUnmarkPaid,
}: StandalonePurchaseRowProps) {
  const { purchase, item, totalCents, paid, dueOn } = summary
  const urgency = isCurrentMonth && !paid && dueOn ? fixedExpenseUrgency(parseISO(dueOn), new Date()) : 'neutral'

  return (
    <li className="flex min-w-0 items-center gap-3 px-panel py-3.5 transition-colors duration-150 hover:bg-fill-subtle">
      <IconSquare
        active={paid}
        onClick={paid ? onUnmarkPaid : onMarkPaid}
        aria-pressed={paid}
        aria-label={paid ? `${purchase.description}: pagada` : `${purchase.description}: marcar pagada`}
      >
        {paid ? <Check className="size-2.5" strokeWidth={1.8} aria-hidden /> : <Plus className="size-2.5" strokeWidth={1.8} aria-hidden />}
      </IconSquare>

      <button type="button" onClick={onEdit} aria-label={`${purchase.description}: editar`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg">
            {purchase.description} <span className="font-normal text-fg-muted">{etiquetaCuota(item.installment_no, item.installments)}</span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{categoryName ?? 'Sin categoría'}</p>
        </div>
      </button>

      {purchase.due_day != null && (
        <Badge variant={paid ? 'soft' : urgency} className="shrink-0 whitespace-nowrap">
          {paid ? 'Pagada' : urgency === 'red' ? `Venció el ${purchase.due_day}` : `Vence el ${purchase.due_day}`}
        </Badge>
      )}

      <Money cents={totalCents} tone={paid ? 'dim' : 'fg'} size="row" hidden={hidden} className="w-24 shrink-0 justify-end" />
    </li>
  )
}
