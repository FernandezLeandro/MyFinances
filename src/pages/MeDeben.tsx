import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { IconSquare } from '@/components/ui/IconSquare'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { AccordionHeader } from '@/components/ui/AccordionHeader'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { initialsFrom } from '@/lib/initials'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { agruparPorMesEsperado, summarizeReceivables, type ReceivableSummary } from '@/features/receivables/aggregate'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ReceivableDetailDialog } from '@/features/receivables/ReceivableDetailDialog'
import { RegistrarAbonoDialog } from '@/features/receivables/RegistrarAbonoDialog'

/** Una de las tres cifras del hero (Vencido / Este mes / Más adelante). */
function HeroStat({ label, cents, tone, hint }: { label: string; cents: number; tone: MoneyTone; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">{label}</p>
      <Money cents={cents} size="compact" tone={tone} className="mt-0.5" />
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-fg-muted">{hint}</p>}
    </div>
  )
}

/** Banda de encabezado de cada grupo de mes — a diferencia de `GroupHeader` (Movimientos), ésta
 *  lleva fondo propio y un segundo texto de color (vencido/este mes/más adelante) al lado del mes,
 *  un tratamiento que no se repite en ningún otro lado — no vale la pena forzarlo dentro del
 *  componente compartido. */
function MonthGroupHeader({ label, hint, hintTone, totalCents }: { label: string; hint: string; hintTone: 'negative' | 'muted'; totalCents: number }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-fill-subtle px-6 py-[7px]">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-fg-secondary uppercase">{label}</span>
        <span className={cn('text-[11px] font-semibold', hintTone === 'negative' ? 'text-negative' : 'text-fg-muted')}>{hint}</span>
      </div>
      <Money cents={totalCents} size="row" tone="dim" />
    </div>
  )
}

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
  const pct = receivable.amountCents > 0 ? Math.min((paidCents / receivable.amountCents) * 100, 100) : 0
  const barTone = pct === 0 ? 'muted' : vencida ? 'negative' : 'accent'

  const noteText =
    vencida && receivable.expected_period
      ? `Venció en ${format(parseISO(receivable.expected_period), 'MMMM yyyy', { locale: es })}`
      : (receivable.note ?? null)
  const abonadoText = paidCents > 0 ? (
    <>
      <Money cents={paidCents} tone="dim" size="inline" /> de <Money cents={receivable.amountCents} tone="dim" size="inline" /> abonado
    </>
  ) : (
    'Sin abonos'
  )
  const initials = initialsFrom(receivable.name, null)

  return (
    <li className="border-b border-divider last:border-b-0">
      {/* Escritorio: avatar + nombre/nota a la izquierda, barra de avance (190px) con el abonado
          debajo, importe y el "+" de registrar abono. */}
      <div className="hidden items-center gap-3.5 px-6 py-3 transition-colors duration-150 hover:bg-fill-subtle lg:flex">
        <Avatar initials={initials} size="sm" shape="square" tone="accent" />
        <button type="button" onClick={onOpenDetail} aria-label={`${receivable.name}: ver detalle`} className="flex min-w-0 flex-1 items-center text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13.5px] font-semibold text-fg">{receivable.name}</p>
              {receivable.already_expensed && (
                <Badge variant="outline" className="shrink-0">
                  {receivable.expense_transaction_id != null ? 'Descontado' : 'Ya cargado como gasto'}
                </Badge>
              )}
            </div>
            {noteText && <p className={cn('mt-0.5 truncate text-[11.5px]', vencida ? 'text-negative' : 'text-fg-muted')}>{noteText}</p>}
          </div>
        </button>
        <div className="w-[190px] shrink-0">
          <MiniProgress pct={pct} tone={barTone} size="bar" />
          <p className="mt-1.5 text-[11px] text-fg-muted">{abonadoText}</p>
        </div>
        <Money cents={pendingCents} tone="fg" size="row" className="w-24 shrink-0 justify-end" />
        <IconSquare onClick={onRegisterPayment} aria-label={`${receivable.name}: registrar abono`}>
          <Plus className="size-3" strokeWidth={1.8} aria-hidden />
        </IconSquare>
      </div>

      {/* Mobile: la barra de 190px no entra al lado del resto — se achica e integra en la misma
          línea que la nota, como hace el mock. */}
      <div className="flex items-center gap-3 px-6 py-3 transition-colors duration-150 hover:bg-fill-subtle lg:hidden">
        <Avatar initials={initials} size="sm" shape="square" tone="accent" />
        <button type="button" onClick={onOpenDetail} aria-label={`${receivable.name}: ver detalle`} className="flex min-w-0 flex-1 items-center text-left">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">{receivable.name}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <MiniProgress pct={pct} tone={barTone} />
              {noteText && <span className={cn('truncate text-[11px]', vencida ? 'text-negative' : 'text-fg-muted')}>{noteText}</span>}
            </div>
          </div>
        </button>
        <Money cents={pendingCents} tone="fg" size="row" />
        <IconSquare onClick={onRegisterPayment} aria-label={`${receivable.name}: registrar abono`}>
          <Plus className="size-3" strokeWidth={1.8} aria-hidden />
        </IconSquare>
      </div>
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

  // Vencido → esta semana ya pasó de largo, es lo más accionable. Este mes = mismo criterio que
  // `vencida` en `aggregate.ts`, pero sin haber cruzado el límite. Más adelante agrupa tanto lo
  // futuro como lo sin fecha — "no sé cuándo" no es más urgente que un mes concreto que se viene.
  const currentPeriod = format(new Date(), 'yyyy-MM-01')
  const vencidas = useMemo(() => summary.pendientes.filter((s) => s.vencida), [summary.pendientes])
  const esteMesItems = useMemo(
    () => summary.pendientes.filter((s) => !s.vencida && s.receivable.expected_period === currentPeriod),
    [summary.pendientes, currentPeriod],
  )
  const masAdelanteItems = useMemo(
    () => summary.pendientes.filter((s) => !s.vencida && s.receivable.expected_period !== currentPeriod),
    [summary.pendientes, currentPeriod],
  )
  const sum = (items: ReceivableSummary[]) => items.reduce((acc, s) => acc + s.pendingCents, 0)
  const vencidoCents = sum(vencidas)
  const esteMesCents = sum(esteMesItems)
  const masAdelanteCents = sum(masAdelanteItems)

  const devueltoPct = summary.totalLentCents > 0 ? Math.min((summary.totalReturnedCents / summary.totalLentCents) * 100, 100) : 0

  function openNew() {
    setFormOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        <div className="lg:hidden">
          <h1 className="font-display text-figure font-semibold">Quién te debe plata</h1>
        </div>

        <div className="hidden lg:block">
          <p className="eyebrow">Deudas a favor</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Quién te debe plata</h1>
        </div>

        {/* Ya no hay tabs Fijos/Mis Deudas/Me Deben acá — cada pantalla se navega desde el nav
            general, no cruzando entre sí (mismo cambio que ya se hizo en Fijos y Mis Deudas). El
            botón va en su propia fila `flex` (no directo en el `header`, que es `flex-col` en
            mobile): ahí `flex-1` estira ancho de columna, acá adentro del `header` hubiera estirado
            alto en vez de ancho — mismo error que se coló la primera vez. */}
        <div className="flex gap-2">
          <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={openNew} className="flex-1 lg:flex-none">
            Nueva deuda
          </Button>
        </div>
      </header>

      {isError ? (
        <Panel className="px-6 py-10">
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-panel" />
          <Skeleton className="h-96 w-full rounded-panel" />
        </div>
      ) : !hasAny ? (
        <Panel>
          <EmptyState
            glyph="◷"
            title="Todavía no cargaste ninguna deuda a favor"
            hint="Cuando le prestes plata a alguien, anotala acá para no olvidarte."
            action={<Button onClick={openNew}>Nueva deuda</Button>}
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-6 p-[18px] lg:flex-row lg:items-center lg:gap-10 lg:p-7">
            <div className="lg:hidden">
              <p className="eyebrow">Te deben en total</p>
              <Money cents={summary.totalPendingCents} size="hero" className="mt-1" />
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-fill-subtle">
                <div className="h-full bg-accent" style={{ width: `${devueltoPct}%` }} />
              </div>
              <p className="mt-2 text-[10.5px] text-fg-muted">
                Ya te devolvieron <Money cents={summary.totalReturnedCents} tone="dim" size="inline" /> de{' '}
                <Money cents={summary.totalLentCents} tone="dim" size="inline" /> prestados
              </p>
              {/* Sólo Vencido/Este mes acá — "Más adelante" ya se ve agrupado más abajo en la lista,
                  y con las tres cifras compitiendo por 342px de ancho un importe grande (6-7
                  cifras) no tenía dónde entrar y se solapaba con la de al lado (ver feedback de
                  Lean). `flex-wrap`, no `grid-cols-2`, por el mismo motivo que en Fijos: los
                  números no cortan, así que la que no entra tiene que bajar entera a su propio
                  renglón en vez de superponerse. */}
              <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-divider pt-3.5">
                <HeroStat label="Vencido" cents={vencidoCents} tone={vencidoCents > 0 ? 'negative' : 'fg'} />
                <HeroStat label="Este mes" cents={esteMesCents} tone="fg" />
              </div>
            </div>

            <div className="hidden flex-none lg:block">
              <p className="eyebrow">Te deben en total</p>
              <Money cents={summary.totalPendingCents} size="hero" className="mt-1" />
              <p className="mt-2 text-[12px] text-fg-muted">
                {summary.pendientes.length} deuda{summary.pendientes.length === 1 ? '' : 's'} abierta{summary.pendientes.length === 1 ? '' : 's'} · no
                suma al saldo proyectado
              </p>
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-fill-subtle">
                <div className="h-full bg-accent" style={{ width: `${devueltoPct}%` }} />
              </div>
              <p className="mt-2.5 text-[11.5px] text-fg-muted">
                Ya te devolvieron <Money cents={summary.totalReturnedCents} tone="dim" size="inline" /> de{' '}
                <Money cents={summary.totalLentCents} tone="dim" size="inline" /> prestados
              </p>
              {/* `flex-wrap`, no un `flex` fijo: acá hay más aire que en mobile, pero con las tres
                  cifras sin envolver un importe de 6-7 dígitos igual puede quedarse sin lugar. */}
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                <HeroStat
                  label="Vencido"
                  cents={vencidoCents}
                  tone={vencidoCents > 0 ? 'negative' : 'fg'}
                  hint={vencidas.length > 0 ? `${vencidas.length} deuda${vencidas.length === 1 ? '' : 's'}` : undefined}
                />
                <HeroStat
                  label="Este mes"
                  cents={esteMesCents}
                  tone="fg"
                  hint={esteMesItems.length > 0 ? `${esteMesItems.length} deuda${esteMesItems.length === 1 ? '' : 's'}` : undefined}
                />
                <HeroStat
                  label="Más adelante"
                  cents={masAdelanteCents}
                  tone="fg"
                  hint={masAdelanteItems.length > 0 ? `${masAdelanteItems.length} deuda${masAdelanteItems.length === 1 ? '' : 's'}` : undefined}
                />
              </div>
            </div>
          </Panel>

          <Panel className="flex flex-col">
            <CardHeader
              title="Pendientes"
              action={
                <span className="text-[11.5px] text-fg-muted">
                  {summary.pendientes.length} deuda{summary.pendientes.length === 1 ? '' : 's'} · por mes esperado de cobro
                </span>
              }
            />
            {summary.pendientes.length === 0 ? (
              <p className="px-6 pt-2 pb-5 text-[13px] text-fg-muted">No tenés deudas pendientes.</p>
            ) : (
              <>
                {groups.map((group) => {
                  const isVencido = group.items.some((s) => s.vencida)
                  const hint = isVencido ? 'vencido' : group.period === currentPeriod ? 'este mes' : group.period ? 'más adelante' : 'no sabés cuándo'
                  return (
                    <div key={group.period ?? 'sin-fecha'}>
                      <MonthGroupHeader
                        label={group.period ? format(parseISO(group.period), 'MMMM yyyy', { locale: es }) : 'Sin fecha'}
                        hint={hint}
                        hintTone={isVencido ? 'negative' : 'muted'}
                        totalCents={group.totalPendingCents}
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
                  )
                })}
                <div className="flex items-center justify-between gap-3 px-6 py-3.5">
                  <span className="text-[12px] text-fg-muted">Total pendiente</span>
                  <Money cents={summary.totalPendingCents} size="row" />
                </div>
              </>
            )}
          </Panel>

          {summary.cobradas.length > 0 && (
            <Panel className="p-5">
              <AccordionHeader
                label={`Cobradas (${summary.cobradas.length})`}
                extra={<Money cents={summary.cobradas.reduce((sum, s) => sum + s.receivable.amountCents, 0)} tone="dim" size="row" />}
                expanded={cobradasExpanded}
                onToggle={() => setCobradasExpanded((v) => !v)}
              />
              {cobradasExpanded && (
                <ul className="mt-3 -mx-5">
                  {summary.cobradas.map((item) => (
                    <li
                      key={item.receivable.id}
                      className="flex items-center gap-3 px-5 py-2.5 opacity-60 transition-colors duration-150 hover:bg-fill-subtle"
                    >
                      <button
                        type="button"
                        onClick={() => setDetailId(item.receivable.id)}
                        aria-label={`${item.receivable.name}: ver detalle`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-[13.5px] text-fg-muted">{item.receivable.name}</p>
                      </button>
                      <Money cents={item.receivable.amountCents} tone="dim" size="row" />
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
        <ReceivableDetailDialog open={!!detailSummary} onClose={() => setDetailId(null)} summary={detailSummary} />
      )}
      {abonoSummary && (
        <RegistrarAbonoDialog open={!!abonoSummary} onClose={() => setAbonoId(null)} summary={abonoSummary} />
      )}
    </div>
  )
}
