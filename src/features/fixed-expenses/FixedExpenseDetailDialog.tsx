import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useFixedExpensePaymentHistory,
  useFixedExpenseSavings,
  useRemoveFixedExpenseSaving,
  useUnmarkFixedExpensePayment,
  type FixedExpense,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/api'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { bagPeriodNoun } from '@/features/fixed-expenses/period'

interface FixedExpenseDetailDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
}

/** Un período (mes) del historial, con sus cargas agrupadas — sólo tiene más de una fila cuando es
 *  una bolsa (`is_recurring`). */
interface PeriodGroup {
  period: string
  payments: FixedExpensePayment[]
  totalCents: number
}

function groupByPeriod(payments: FixedExpensePayment[]): PeriodGroup[] {
  // `payments` ya viene ordenado período desc, pago desc (ver `useFixedExpensePaymentHistory`) —
  // agrupar preservando ese orden de aparición alcanza, no hace falta un sort propio acá.
  const groups: PeriodGroup[] = []
  const byPeriod = new Map<string, PeriodGroup>()
  for (const payment of payments) {
    let group = byPeriod.get(payment.period)
    if (!group) {
      group = { period: payment.period, payments: [], totalCents: 0 }
      byPeriod.set(payment.period, group)
      groups.push(group)
    }
    group.payments.push(payment)
    group.totalCents += payment.amountPaidCents
  }
  return groups
}

/** Historial de pagos de un fijo, con edición de la plantilla on-demand. Mismo patrón que
 *  BucketDetailDialog en Ahorros: el detalle abierto, y desde ahí se entra a editar.
 *
 *  Un fijo de una sola vez tiene a lo sumo un pago por mes — se lista plano, sin agrupar. Una bolsa
 *  puede tener varias cargas en el mismo mes, así que el historial se agrupa por período con un
 *  total por mes y cada carga individual debajo, con su propio botón para quitarla. */
export function FixedExpenseDetailDialog({ open, onClose, fixedExpense }: FixedExpenseDetailDialogProps) {
  const [formOpen, setFormOpen] = useState(false)
  const { data: payments, isPending } = useFixedExpensePaymentHistory(fixedExpense.id)
  const unmarkPayment = useUnmarkFixedExpensePayment()
  const currentPeriod = useMemo(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'), [])
  // Follow-up: sólo el guardado del mes EN CURSO, no todo el histórico — a Lean no le interesa ver
  // en meses posteriores lo que guardó en meses anteriores (los guardados viejos siguen en la base,
  // ligados a su movimiento o pago si lo tenían, sólo dejan de listarse acá). El guardado sólo
  // aplica a un fijo "una vez al mes" — `[]` en una bolsa desactiva la query entera (mismo criterio
  // que `enabled` en el resto de los hooks de la app).
  const { data: currentMonthSavings, isPending: savingsPending } = useFixedExpenseSavings(
    fixedExpense.is_recurring ? [] : [currentPeriod],
  )
  const removeSaving = useRemoveFixedExpenseSaving()

  const groups = useMemo(() => groupByPeriod(payments ?? []), [payments])
  const savings = useMemo(
    () => (currentMonthSavings ?? []).filter((s) => s.fixed_expense_id === fixedExpense.id),
    [currentMonthSavings, fixedExpense.id],
  )
  // Con el mes ya pagado, el guardado no se puede tocar (`rpc_remove_fixed_expense_saving` lo
  // rechaza — el pago pudo haberse calculado restando este guardado): sacar la X evita el error.
  const currentPeriodPaid = (payments ?? []).some((p) => p.period === currentPeriod)

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir "Editar" encima, porque `open` de este Dialog baja a
  // false). Sin este filtro, editar cerraba todo el historial de un tirón — mismo gotcha que ya
  // apareció en Ahorros y en Ajustar saldo.
  function handleDetailClose() {
    if (!formOpen) onClose()
  }

  return (
    <>
      <Dialog
        open={open && !formOpen}
        onClose={handleDetailClose}
        title={fixedExpense.name}
        footer={
          <>
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="outline" size="dialogFooter" onClick={() => setFormOpen(true)}>
              Editar
            </Button>
          </>
        }
      >
        <div className="mb-5 border-b border-fill-subtle pb-5">
          <p className="eyebrow">
            {fixedExpense.is_recurring ? `Presupuesto ${bagPeriodNoun(fixedExpense.bag_frequency).adjective}` : 'Importe actual'}
          </p>
          <Money cents={fixedExpense.cents} tone="dim" size="figure" className="mt-1" />
          {fixedExpense.due_day != null && <p className="mt-2 text-[12px] text-fg-muted">Vence el {fixedExpense.due_day}</p>}
        </div>

        <p className="eyebrow mb-3">Historial de pagos</p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState glyph="◷" title="Todavía no registraste pagos de este fijo" />
        ) : fixedExpense.is_recurring ? (
          <ul className="-mx-6 flex max-h-[50vh] flex-col overflow-y-auto">
            {groups.map((group) => (
              <li key={group.period} className="border-t border-fill-subtle first:border-t-0">
                <div className="flex items-center gap-3 px-6 pt-3 pb-1.5">
                  <p className="min-w-0 flex-1 truncate text-[14px] text-fg capitalize">
                    {format(parseISO(group.period), 'MMMM yyyy', { locale: es })}
                  </p>
                  <Money cents={group.totalCents} tone="dim" />
                </div>
                <ul>
                  {group.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3 px-6 py-1.5 pl-9">
                      <p className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
                        {format(parseISO(payment.paid_at), "d 'de' MMMM", { locale: es })}
                        {payment.note ? ` · ${payment.note}` : ''}
                      </p>
                      <Money cents={payment.amountPaidCents} tone="dim" size="inline" />
                      <button
                        type="button"
                        onClick={() => unmarkPayment.mutate({ paymentId: payment.id })}
                        disabled={unmarkPayment.isPending}
                        aria-label="Quitar esta carga"
                        className="grid size-6 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                      >
                        <X className="size-3" strokeWidth={1.5} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="-mx-6 flex max-h-[50vh] flex-col overflow-y-auto">
            {groups.map((group) => (
              // Fila inerte a propósito: en esta versión no se puede editar un pago histórico de un
              // fijo de una sola vez (para corregir uno, se desmarca desde Fijos y se vuelve a
              // marcar) — un botón que no hace nada es peor que ningún botón.
              <li key={group.period} className="flex items-center gap-3 border-t border-fill-subtle px-6 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-fg capitalize">{format(parseISO(group.period), 'MMMM yyyy', { locale: es })}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    Pagado el {format(parseISO(group.payments[0].paid_at), "d 'de' MMMM", { locale: es })}
                  </p>
                </div>
                <Money cents={group.totalCents} tone="dim" />
              </li>
            ))}
          </ul>
        )}

        {/* Bloque 3: sólo un fijo de una vez guarda plata — una bolsa ya se va cargando de a partes
            como gasto real, este bloque entero no le corresponde. Follow-up: sólo el mes en curso
            (`currentMonthSavings`), no el histórico completo — ver el comentario de más arriba. */}
        {!fixedExpense.is_recurring && (
          <>
            <p className="eyebrow mt-5 mb-3">Guardado este mes</p>
            {savingsPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : savings.length === 0 ? (
              <EmptyState glyph="◷" title="Todavía no guardaste plata este mes para este fijo" />
            ) : (
              // Lista plana, sin agrupar por período: como sólo se muestra el mes en curso, ya no
              // hace falta un total por mes — a diferencia del historial de pagos de arriba.
              <ul className="-mx-6 flex max-h-[45vh] flex-col overflow-y-auto">
                {savings.map((saving) => (
                  <li key={saving.id} className="flex items-center gap-3 px-6 py-2 border-t border-fill-subtle first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-fg-muted">
                        {format(parseISO(saving.saved_at), "d 'de' MMMM", { locale: es })}
                        {saving.note ? ` · ${saving.note}` : ''}
                      </p>
                      {saving.transaction_id != null && <p className="text-[11px] text-fg-muted">Con movimiento</p>}
                    </div>
                    <Money cents={saving.amountCents} tone="dim" size="inline" />
                    {/* Con el mes ya pagado no se puede quitar (el RPC lo rechaza: el pago pudo
                        haberse calculado restando este guardado) — ocultar la X evita el error. */}
                    {!currentPeriodPaid && (
                      <button
                        type="button"
                        onClick={() => removeSaving.mutate({ savingId: saving.id })}
                        disabled={removeSaving.isPending}
                        aria-label="Quitar este guardado"
                        className="grid size-6 shrink-0 place-items-center rounded-chip text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                      >
                        <X className="size-3" strokeWidth={1.5} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Dialog>

      {formOpen && (
        <FixedExpenseFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          fixedExpense={fixedExpense}
          onDeleted={onClose}
        />
      )}
    </>
  )
}
