import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { History, PiggyBank, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogEmptyNote, DialogFooterBar } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import {
  useFixedExpensePaymentHistory,
  useFixedExpenseSavings,
  useRemoveFixedExpenseSaving,
  useUnmarkWithLegacyConfirm,
  type FixedExpense,
  type FixedExpensePayment,
} from '@/features/fixed-expenses/api'
import { FixedExpenseFormDialog } from '@/features/fixed-expenses/FixedExpenseFormDialog'
import { UnmarkBeforeAccountsDialog } from '@/features/fixed-expenses/UnmarkBeforeAccountsDialog'
import { bagPeriodNoun, dueDayTemplateLabel, fixedExpenseScheduleLabel } from '@/features/fixed-expenses/period'

const cardClass = 'flex flex-col rounded-panel-sm border border-border'

interface FixedExpenseDetailDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense: FixedExpense
  /** Mes (`yyyy-MM-01`) que se está mirando en Fijos. Una bolsa lista sólo las cargas de ese mes;
   *  un fijo de una vez sigue mostrando su historial completo. */
  period: string
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
 *  total por mes y cada carga individual debajo, con su propio botón para quitarla.
 *
 *  Rediseño de modales v2, «recibo» (como `MovementDetailDialog`): header teñido con el color de la
 *  categoría del fijo, importe centrado, y historial/guardado en tarjetas con borde. Las tarjetas no
 *  llevan scroll propio: ya scrollea el cuerpo del `Dialog`. */
export function FixedExpenseDetailDialog({ open, onClose, fixedExpense, period }: FixedExpenseDetailDialogProps) {
  const [formOpen, setFormOpen] = useState(false)
  const { data: payments, isPending } = useFixedExpensePaymentHistory(fixedExpense.id)
  const unmarkPayment = useUnmarkWithLegacyConfirm()
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
  const { data: categories } = useCategories(true)
  const category = (categories ?? []).find((c) => c.id === fixedExpense.category_id)
  const look = chipLook(category)
  const tint = 'color' in look ? look.color : undefined

  // Una bolsa sólo muestra las cargas del mes mirado en Fijos, no las de otros meses (pedido de Lean).
  const groups = useMemo(
    () => groupByPeriod((payments ?? []).filter((p) => !fixedExpense.is_recurring || p.period === period)),
    [payments, fixedExpense.is_recurring, period],
  )
  const periodLabel = format(parseISO(period), 'MMMM yyyy', { locale: es })
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
        subtitle={`${category?.name ?? 'Sin categoría'} · ${fixedExpenseScheduleLabel(fixedExpense)}`}
        icon={<CategoryChip {...look} size={40} />}
        tint={tint}
        size="sm"
        footerBleed
        footer={
          <DialogFooterBar>
            <Button variant="outline" size="dialogFooter" onClick={onClose}>
              Cerrar
            </Button>
            <Button size="dialogFooter" onClick={() => setFormOpen(true)}>
              Editar
            </Button>
          </DialogFooterBar>
        }
      >
        <div className="mb-5 flex flex-col items-center gap-1 pt-1">
          <Money cents={fixedExpense.cents} tone="fg" size="figure" />
          <p className="text-center text-[12.5px] text-fg-secondary">
            {fixedExpense.is_recurring ? `Presupuesto ${bagPeriodNoun(fixedExpense.bag_frequency).adjective}` : 'Importe actual'}
          </p>
          {/* L2 del QA: con 29–31 un mes corto lo corre al último día — se aclara en vez de mentir. */}
          {fixedExpense.due_day != null && fixedExpense.due_day >= 29 && (
            <p className="text-center text-[12px] text-fg-muted">{dueDayTemplateLabel(fixedExpense.due_day)}</p>
          )}
        </div>

        <p className="mb-2 text-[13px] font-semibold text-fg">{fixedExpense.is_recurring ? `Cargas de ${periodLabel}` : 'Historial de pagos'}</p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <DialogEmptyNote icon={<History />}>
            {fixedExpense.is_recurring ? `Sin cargas en ${periodLabel}` : 'Todavía no registraste pagos de este fijo'}
          </DialogEmptyNote>
        ) : fixedExpense.is_recurring ? (
          // Una bolsa sólo lista las cargas del mes mirado: una sola tanda, plana, con el total abajo.
          <ul className={cardClass}>
            {groups[0].payments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 border-b border-divider-list py-2 pr-2 pl-3.5">
                <p className="min-w-0 flex-1 break-words text-[14px] font-semibold text-fg">
                  {payment.note || format(parseISO(payment.paid_at), "d 'de' MMMM", { locale: es })}
                  {payment.note && (
                    <span className="block text-[12px] font-normal text-fg-secondary">
                      {format(parseISO(payment.paid_at), "d 'de' MMMM", { locale: es })}
                    </span>
                  )}
                </p>
                <Money cents={payment.amountPaidCents} tone="fg" size="inline" />
                <button
                  type="button"
                  onClick={() => unmarkPayment.unmarkPayment(payment.id)}
                  disabled={unmarkPayment.isPending}
                  aria-label="Quitar esta carga"
                  className="grid size-8 shrink-0 place-items-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                >
                  <X className="size-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
            <li className="flex items-center gap-3 rounded-b-panel-sm bg-surface-sunken py-3 pr-[52px] pl-3.5">
              <span className="flex-1 text-[13px] text-fg-secondary">Total cargado este mes</span>
              <Money cents={groups[0].totalCents} tone="fg" size="inline" />
            </li>
          </ul>
        ) : (
          <ul className={cardClass}>
            {groups.map((group) => (
              // Fila inerte a propósito: en esta versión no se puede editar un pago histórico de un
              // fijo de una sola vez (para corregir uno, se desmarca desde Fijos y se vuelve a
              // marcar) — un botón que no hace nada es peor que ningún botón.
              <li key={group.period} className="flex items-center gap-3 border-b border-divider-list px-3.5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-fg capitalize">{format(parseISO(group.period), 'MMMM yyyy', { locale: es })}</p>
                  <p className="mt-0.5 text-[12px] text-fg-secondary">
                    Pagado el {format(parseISO(group.payments[0].paid_at), "d 'de' MMMM", { locale: es })}
                  </p>
                </div>
                <Money cents={group.totalCents} tone="fg" size="inline" />
              </li>
            ))}
          </ul>
        )}

        {/* Bloque 3: sólo un fijo de una vez guarda plata — una bolsa ya se va cargando de a partes
            como gasto real, este bloque entero no le corresponde. Follow-up: sólo el mes en curso
            (`currentMonthSavings`), no el histórico completo — ver el comentario de más arriba. */}
        {!fixedExpense.is_recurring && (
          <>
            <p className="mt-5 mb-2 text-[13px] font-semibold text-fg">Guardado este mes</p>
            {savingsPending ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : savings.length === 0 ? (
              <DialogEmptyNote icon={<PiggyBank />}>Todavía no guardaste plata este mes para este fijo</DialogEmptyNote>
            ) : (
              // Lista plana, sin agrupar por período: como sólo se muestra el mes en curso, ya no
              // hace falta un total por mes — a diferencia del historial de pagos de arriba.
              <ul className={cardClass}>
                {savings.map((saving) => (
                  <li key={saving.id} className="flex items-center gap-3 border-b border-divider-list py-2 pr-2 pl-3.5 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13px] font-semibold text-fg">
                        {format(parseISO(saving.saved_at), "d 'de' MMMM", { locale: es })}
                        {saving.note ? ` · ${saving.note}` : ''}
                      </p>
                      {saving.transaction_id != null && <p className="text-[11.5px] text-fg-secondary">Con movimiento</p>}
                    </div>
                    <Money cents={saving.amountCents} tone="fg" size="inline" />
                    {/* Con el mes ya pagado no se puede quitar (el RPC lo rechaza: el pago pudo
                        haberse calculado restando este guardado) — ocultar la X evita el error. */}
                    {!currentPeriodPaid && (
                      <button
                        type="button"
                        onClick={() => removeSaving.mutate({ savingId: saving.id })}
                        disabled={removeSaving.isPending}
                        aria-label="Quitar este guardado"
                        className="grid size-8 shrink-0 place-items-center rounded-control text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative disabled:opacity-40"
                      >
                        <X className="size-3.5" strokeWidth={1.75} aria-hidden />
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
          period={period}
          onDeleted={onClose}
        />
      )}
      <UnmarkBeforeAccountsDialog
        open={unmarkPayment.confirmOpen}
        busy={unmarkPayment.isPending}
        onClose={unmarkPayment.cancelConfirm}
        onConfirm={unmarkPayment.confirmForce}
      />
    </>
  )
}
