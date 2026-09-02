import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight, Plus } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PendientesTabs } from '@/components/PendientesTabs'
import { cn } from '@/lib/cn'
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
    <li className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850">
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`${receivable.name}: ver detalle`}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] text-chalk">{receivable.name}</p>
            {receivable.already_expensed && <Chip className="shrink-0">Ya cargado como gasto</Chip>}
          </div>

          {hasPartialPayments ? (
            <p className="mt-1 text-[12px] text-chalk-faint">
              <Money cents={paidCents} tone="dim" /> de <Money cents={receivable.amountCents} tone="dim" /> abonado
            </p>
          ) : vencida && receivable.expected_period ? (
            <p className="mt-0.5 text-[12px] text-coral">
              Venció en {format(parseISO(receivable.expected_period), 'MMMM yyyy', { locale: es })}
            </p>
          ) : null}
        </div>
      </button>

      <Money cents={pendingCents} tone="acid" />

      <button
        type="button"
        onClick={onRegisterPayment}
        aria-label={`${receivable.name}: registrar abono`}
        className="grid size-6 shrink-0 place-items-center rounded-chip bg-ink-800 text-chalk-faint transition-colors duration-150 hover:bg-ink-700 hover:text-chalk"
      >
        <Plus className="size-3" strokeWidth={1.5} aria-hidden />
      </button>
    </li>
  )
}

/**
 * A diferencia de Fijos y Créditos, esta pantalla NO navega por mes con `MonthNav`. Esas dos
 * responden "qué debo ESTE mes" — la obligación nace y muere en el período. Una deuda a favor es
 * un ítem abierto que cruza meses: si la pantalla estuviera anclada a septiembre, la deuda que te
 * pagan en noviembre no se vería, y una vencida de agosto desaparecería justo cuando más importa.
 * El eje temporal se muestra AGRUPANDO por mes esperado, no navegando.
 */
export function Deudas() {
  const [formOpen, setFormOpen] = useState(false)
  const [detailSummary, setDetailSummary] = useState<ReceivableSummary | null>(null)
  const [abonoSummary, setAbonoSummary] = useState<ReceivableSummary | null>(null)
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
        <div className="flex flex-col gap-6">
          <Skeleton className="h-32 w-full rounded-panel" />
          <Skeleton className="h-48 w-full rounded-panel" />
        </div>
      ) : !hasAny ? (
        <EmptyState
          glyph="◷"
          title="Todavía no cargaste ninguna deuda a favor"
          hint="Cuando le prestes plata a alguien, anotala acá para no olvidarte."
          action={<Button onClick={openNew}>Nueva deuda</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <Panel className="p-6 ring-1 ring-acid/15">
            <p className="eyebrow">Te deben en total</p>
            <Money cents={summary.totalPendingCents} tone="chalk" size="figure" className="mt-2" />
            <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">Cuenta en tu saldo</dt>
                <dd>
                  <Money cents={summary.contadoEnSaldoCents} tone="dim" />
                </dd>
              </div>
              {summary.yaGastadoPendingCents > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Ya lo cargaste como gasto</dt>
                  <dd>
                    <Money cents={summary.yaGastadoPendingCents} tone="dim" />
                  </dd>
                </div>
              )}
              {summary.vencidasCount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-chalk-faint">Vencidas</dt>
                  <dd className="text-coral">{summary.vencidasCount}</dd>
                </div>
              )}
            </dl>
            <p className="mt-4 text-[12px] text-chalk-faint">
              No suma al saldo proyectado: es plata que todavía no volvió.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Pendientes" hint="Agrupadas por mes esperado de cobro" />
            {summary.pendientes.length === 0 ? (
              <p className="px-6 pt-2 pb-4 text-[13px] text-chalk-faint">No tenés deudas pendientes.</p>
            ) : (
              <div className="pb-3">
                {groups.map((group) => (
                  <div key={group.period ?? 'sin-fecha'}>
                    <div className="flex items-center gap-3 px-6 pt-4 pb-1">
                      <p className="eyebrow flex-1 capitalize">
                        {group.period ? format(parseISO(group.period), 'MMMM yyyy', { locale: es }) : 'Sin fecha'}
                      </p>
                      <Money cents={group.totalPendingCents} tone="dim" size="inline" />
                    </div>
                    <ul>
                      {group.items.map((item) => (
                        <ReceivableRow
                          key={item.receivable.id}
                          summary={item}
                          onOpenDetail={() => setDetailSummary(item)}
                          onRegisterPayment={() => setAbonoSummary(item)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {summary.cobradas.length > 0 && (
            <Panel>
              <button
                type="button"
                onClick={() => setCobradasExpanded((v) => !v)}
                aria-expanded={cobradasExpanded}
                className="eyebrow flex w-full items-center gap-1.5 px-6 pt-5 pb-3 text-left transition-colors duration-150 hover:text-chalk"
              >
                <ChevronRight
                  className={cn('size-2.5 shrink-0 transition-transform duration-150', cobradasExpanded && 'rotate-90')}
                  strokeWidth={1.5}
                  aria-hidden
                />
                Cobradas ({summary.cobradas.length})
              </button>
              {cobradasExpanded && (
                <ul className="pb-3">
                  {summary.cobradas.map((item) => (
                    <li
                      key={item.receivable.id}
                      className="flex items-center gap-3 px-6 py-3 opacity-60 transition-colors duration-150 hover:bg-ink-850"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailSummary(item)}
                        aria-label={`${item.receivable.name}: ver detalle`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-[14px] text-chalk-faint">{item.receivable.name}</p>
                      </button>
                      <Money cents={item.receivable.amountCents} tone="dim" />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {formOpen && <ReceivableFormDialog open={formOpen} onClose={() => setFormOpen(false)} />}
      {detailSummary && (
        <ReceivableDetailDialog open={!!detailSummary} onClose={() => setDetailSummary(null)} summary={detailSummary} />
      )}
      {abonoSummary && (
        <RegistrarAbonoDialog open={!!abonoSummary} onClose={() => setAbonoSummary(null)} summary={abonoSummary} />
      )}
    </div>
  )
}
