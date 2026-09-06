import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconSquare } from '@/components/ui/IconSquare'
import { AccordionHeader } from '@/components/ui/AccordionHeader'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { KeyValueRow } from '@/components/ui/KeyValueRow'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PendientesTabs } from '@/components/PendientesTabs'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { agruparPorMesEsperado, summarizeReceivables, type ReceivableSummary } from '@/features/receivables/aggregate'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ReceivableDetailDialog } from '@/features/receivables/ReceivableDetailDialog'
import { RegistrarAbonoDialog } from '@/features/receivables/RegistrarAbonoDialog'

function ReceivableRow({
  summary,
  onOpenDetail,
  onRegisterPayment,
}: {
  summary: ReceivableSummary
  onOpenDetail: () => void
  onRegisterPayment: () => void
}) {
  const { receivable, paidCents, pendingCents, vencida } = summary
  const hasPartialPayments = paidCents > 0

  return (
    <li className="flex items-center gap-3 px-6 py-3 transition-colors duration-150 hover:bg-ink-850">
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${receivable.name}: ver detalle`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-chalk">{receivable.name}</p>
            {receivable.already_expensed && (
              <Badge variant="outline" className="shrink-0">
                {receivable.expense_transaction_id != null ? 'Descontado' : 'Ya cargado como gasto'}
              </Badge>
            )}
          </div>

          {hasPartialPayments ? (
            <p className="mt-1 text-[12px] text-chalk-faint">
              <Money cents={paidCents} tone="dim" /> de <Money cents={receivable.amountCents} tone="dim" /> abonado
            </p>
          ) : vencida && receivable.expected_period ? (
            <p className="mt-0.5 text-[12px] text-coral">
              Venció en {format(parseISO(receivable.expected_period), 'MMMM yyyy', { locale: es })}
            </p>
          ) : receivable.note ? (
            <p className="mt-0.5 truncate text-[12px] text-chalk-faint">{receivable.note}</p>
          ) : null}
        </div>
      </button>

      <Money cents={pendingCents} tone="chalk" size="row" />

      <IconSquare onClick={onRegisterPayment} aria-label={`${receivable.name}: registrar abono`}>
        <Plus className="size-3" strokeWidth={1.8} aria-hidden />
      </IconSquare>
    </li>
  )
}

/**
 * A diferencia de Fijos y Mis Deudas, esta pantalla NO navega por mes con `MonthNav`. Esas dos
 * responden "qué debo ESTE mes" — la obligación nace y muere en el período. Una deuda a favor es
 * un ítem abierto que cruza meses: si la pantalla estuviera anclada a septiembre, la deuda que te
 * pagan en noviembre no se vería, y una vencida de agosto desaparecería justo cuando más importa.
 * El eje temporal se muestra AGRUPANDO por mes esperado, no navegando.
 */
export function MeDeben() {
  const [formOpen, setFormOpen] = useState(false)
  // Ids, no el objeto: `summary` se recalcula en cada render con datos frescos de la query, pero un
  // `ReceivableSummary` guardado tal cual en el estado queda pegado al momento del click — después
  // de pagar un abono, el detalle seguía mostrando "Pendiente" y dejaba pagarlo dos veces porque
  // renderizaba ese objeto viejo en vez de volver a buscarlo. Derivar por id en cada render lo evita.
  const [detailId, setDetailId] = useState<string | null>(null)
  const [abonoId, setAbonoId] = useState<string | null>(null)
  const [cobradasExpanded, setCobradasExpanded] = useState(false)

  const { data: receivables, isPending: isReceivablesPending, isError, refetch } = useReceivables()
  const { data: payments, isPending: isPaymentsPending } = useReceivablePayments()
  const isPending = isReceivablesPending || isPaymentsPending

  const summary = useMemo(
    () => summarizeReceivables(receivables ?? [], payments ?? [], new Date()),
    [receivables, payments],
  )
  const groups = useMemo(() => agruparPorMesEsperado(summary.pendientes), [summary.pendientes])
  const hasAny = summary.pendientes.length > 0 || summary.cobradas.length > 0

  const allSummaries = useMemo(() => [...summary.pendientes, ...summary.cobradas], [summary])
  const detailSummary = useMemo(
    () => allSummaries.find((s) => s.receivable.id === detailId) ?? null,
    [allSummaries, detailId],
  )
  const abonoSummary = useMemo(
    () => allSummaries.find((s) => s.receivable.id === abonoId) ?? null,
    [allSummaries, abonoId],
  )

  function openNew() {
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Deudas a favor</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Quién te debe plata</h1>
          <p className="mt-2 max-w-md text-[13px] text-chalk-faint">
            Para no olvidarte de lo que prestaste, aunque te lo devuelvan recién el mes que viene.
          </p>
          <div className="mt-3">
            <PendientesTabs />
          </div>
        </div>
        <Button onClick={openNew} icon={<span className="text-base leading-none">+</span>}>
          Nueva deuda
        </Button>
      </header>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-panel" />
            <Skeleton className="h-14 w-full rounded-panel" />
          </div>
          <Skeleton className="h-96 w-full rounded-panel" />
        </div>
      ) : !hasAny ? (
        <EmptyState
          glyph="◷"
          title="Todavía no cargaste ninguna deuda a favor"
          hint="Cuando le prestes plata a alguien, anotala acá para no olvidarte."
          action={<Button onClick={openNew}>Nueva deuda</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div className="flex flex-col gap-4">
            <Panel className="p-6">
              <p className="eyebrow">Te deben en total</p>
              <Money cents={summary.totalPendingCents} tone="chalk" size="total" className="mt-2.5" />
              <dl className="mt-4 flex flex-col gap-2 border-t border-divider pt-4 text-[13px]">
                <KeyValueRow label={<span className="text-chalk-faint">Cuenta en tu saldo</span>}>
                  <Money cents={summary.contadoEnSaldoCents} tone="dim" />
                </KeyValueRow>
                {summary.yaGastadoPendingCents > 0 && (
                  <KeyValueRow label={<span className="text-chalk-faint">Ya lo cargaste como gasto</span>}>
                    <Money cents={summary.yaGastadoPendingCents} tone="dim" />
                  </KeyValueRow>
                )}
                {summary.vencidasCount > 0 && (
                  <KeyValueRow label={<span className="text-chalk-faint">Vencidas</span>}>
                    <span className="text-coral">{summary.vencidasCount}</span>
                  </KeyValueRow>
                )}
              </dl>
              <p className="mt-4 text-[12px] text-chalk-faint">
                No suma al saldo proyectado: es plata que todavía no volvió.
              </p>
            </Panel>

            {summary.cobradas.length > 0 && (
              <Panel className="p-5">
                <AccordionHeader
                  label={`Cobradas (${summary.cobradas.length})`}
                  expanded={cobradasExpanded}
                  onToggle={() => setCobradasExpanded((v) => !v)}
                />
                {cobradasExpanded && (
                  <ul className="mt-3 -mx-5">
                    {summary.cobradas.map((item) => (
                      <li
                        key={item.receivable.id}
                        className="flex items-center gap-3 px-5 py-2.5 opacity-60 transition-colors duration-150 hover:bg-ink-850"
                      >
                        <button
                          type="button"
                          onClick={() => setDetailId(item.receivable.id)}
                          aria-label={`${item.receivable.name}: ver detalle`}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-[13.5px] text-chalk-faint">{item.receivable.name}</p>
                        </button>
                        <Money cents={item.receivable.amountCents} tone="dim" size="row" />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>

          <Panel className="flex flex-col">
            <CardHeader
              title="Pendientes"
              action={<span className="text-[12px] text-fg-muted">Agrupadas por mes esperado de cobro</span>}
            />
            {summary.pendientes.length === 0 ? (
              <p className="px-6 pt-2 pb-5 text-[13px] text-chalk-faint">No tenés deudas pendientes.</p>
            ) : (
              <div className="pb-3">
                {groups.map((group) => (
                  <div key={group.period ?? 'sin-fecha'}>
                    <GroupHeader
                      className="px-6 pt-4 pb-1"
                      label={group.period ? format(parseISO(group.period), 'MMMM yyyy', { locale: es }) : 'Sin fecha'}
                      total={<Money cents={group.totalPendingCents} tone="dim" size="row" />}
                    />
                    <ul>
                      {group.items.map((item) => (
                        <ReceivableRow
                          key={item.receivable.id}
                          summary={item}
                          onOpenDetail={() => setDetailId(item.receivable.id)}
                          onRegisterPayment={() => setAbonoId(item.receivable.id)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {formOpen && <ReceivableFormDialog open={formOpen} onClose={() => setFormOpen(false)} />}
      {detailSummary && (
        <ReceivableDetailDialog open={!!detailSummary} onClose={() => setDetailId(null)} summary={detailSummary} />
      )}
      {abonoSummary && (
        <RegistrarAbonoDialog open={!!abonoSummary} onClose={() => setAbonoId(null)} summary={abonoSummary} />
      )}
    </div>
  )
}
