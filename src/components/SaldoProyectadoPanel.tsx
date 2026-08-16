import { useState } from 'react'
import { parseISO } from 'date-fns'
import { Pencil } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSpendingBudget } from '@/features/budgets/api'
import { projectBudget } from '@/features/budgets/aggregate'
import { BudgetFormDialog } from '@/features/budgets/BudgetFormDialog'

interface SaldoProyectadoPanelProps {
  /** yyyy-MM-dd, día 1 del mes — Fijos navega meses, Hoy siempre pasa el actual. */
  period: string
  projectedCents: number | undefined
  isPending: boolean
  currentBalanceCents: number
  pendingFixedCount: number
  pendingFixedCents: number
  unpaidCardsCount: number
  unpaidCardsCents: number
  hidden: boolean
  /** Hoy oculta el panel entero cuando no hay nada que descontar (redundante con el hero de
   *  arriba); Fijos lo deja siempre visible con una línea aclaratoria. Ver más abajo: si todavía
   *  no hay presupuesto cargado, el panel no se oculta aunque esto sea `true` — necesita quedar
   *  visible para poder invitar a cargarlo. */
  hideWhenNothingPending?: boolean
}

/**
 * Panel compartido entre Hoy y Fijos (antes ~35 líneas duplicadas en cada página). Agrega acá el
 * cuarto término del saldo proyectado: el gasto variable estimado (hoy sólo "Comida"), calculado
 * con `projectBudget` — misma fórmula que el RPC, ver `features/budgets/aggregate.ts`.
 */
export function SaldoProyectadoPanel({
  period,
  projectedCents,
  isPending,
  currentBalanceCents,
  pendingFixedCount,
  pendingFixedCents,
  unpaidCardsCount,
  unpaidCardsCents,
  hidden,
  hideWhenNothingPending = false,
}: SaldoProyectadoPanelProps) {
  const [editingBudget, setEditingBudget] = useState(false)
  const { data: budget, isPending: isBudgetPending } = useSpendingBudget()

  const projection = projectBudget(budget?.cents ?? 0, parseISO(period), new Date())
  const hasBudgetRow = !!budget && projection.remainingCents > 0

  const nothingPending = pendingFixedCount === 0 && unpaidCardsCount === 0 && !hasBudgetRow
  // Sin presupuesto cargado el panel no se oculta aunque no haya nada más pendiente — es el único
  // lugar donde se puede invitar a cargarlo.
  if (hideWhenNothingPending && !isPending && !isBudgetPending && nothingPending && budget) return null

  return (
    <>
      <Panel className="p-6 ring-1 ring-acid/15">
        <p className="eyebrow">Saldo proyectado a fin de mes</p>
        {isPending ? (
          <Skeleton className="mt-2 h-9 w-32" />
        ) : (
          <Money cents={projectedCents ?? 0} tone="chalk" size="figure" className="mt-2" hidden={hidden} />
        )}

        <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-chalk-faint">Saldo actual</dt>
            <dd>
              <Money cents={currentBalanceCents} tone="dim" hidden={hidden} />
            </dd>
          </div>
          {pendingFixedCount > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">Fijos por pagar ({pendingFixedCount})</dt>
              <dd>
                <Money cents={-pendingFixedCents} tone="coral" hidden={hidden} />
              </dd>
            </div>
          )}
          {unpaidCardsCount > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">Tarjetas por pagar ({unpaidCardsCount})</dt>
              <dd>
                <Money cents={-unpaidCardsCents} tone="coral" hidden={hidden} />
              </dd>
            </div>
          )}
          {!isBudgetPending && (
            <div className="flex justify-between gap-4">
              <dt className="text-chalk-faint">
                <button
                  type="button"
                  onClick={() => setEditingBudget(true)}
                  aria-label={budget ? `Editar ${budget.name}` : 'Estimar gasto de comida'}
                  className="-m-1 inline-flex items-center gap-1 rounded-chip p-1 transition-colors hover:bg-ink-850 hover:text-chalk"
                >
                  {budget ? `${budget.name} (${projection.remainingDays} días)` : 'Gasto variable estimado'}
                  <Pencil className="size-3" strokeWidth={1.5} aria-hidden />
                </button>
              </dt>
              <dd>
                {budget ? (
                  <Money cents={-projection.remainingCents} tone="coral" hidden={hidden} />
                ) : (
                  <span className="text-chalk-faint">—</span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {nothingPending && budget && (
          <p className="mt-3 text-[12px] text-chalk-faint">No tenés fijos ni tarjetas pendientes este mes.</p>
        )}
      </Panel>

      {editingBudget && <BudgetFormDialog open={editingBudget} onClose={() => setEditingBudget(false)} />}
    </>
  )
}
