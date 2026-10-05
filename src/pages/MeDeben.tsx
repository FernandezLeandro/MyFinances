import { useMemo, useState, type ReactNode } from 'react'
import { addMonths, format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { AnimatePresence, m } from 'motion/react'
import { Check, Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { IconSquare } from '@/components/ui/IconSquare'
import { MonthNav } from '@/components/ui/MonthNav'
import { CountUpMoney, Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { Stat, StatRow } from '@/components/ui/Stat'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { initialsFrom } from '@/lib/initials'
import { ROW_PRESENCE } from '@/lib/motion'
import { formatMoney } from '@/lib/money'
import { useToday } from '@/lib/useToday'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { cobradoEnMes, cuotasDelMes, summarizeReceivables, type CuotaDelMes, type ReceivableSummary } from '@/features/receivables/aggregate'
import { estadoDeCobro } from '@/features/receivables/format'
import { ReceivableFormDialog } from '@/features/receivables/ReceivableFormDialog'
import { ReceivableSheet } from '@/features/receivables/ReceivableSheet'

/** Fila de las listas: toda la fila abre el panel de la deuda; el «+» lo abre directo en el cobro
 *  (sin «+» si ya no hay nada para cobrar). `subtitle` pisa la línea de estado — en otro mes importa
 *  la cuota de ESE mes, no el estado de hoy. */
function ReceivableRow({
  summary,
  cents,
  today,
  subtitle,
  onOpen,
  onCobrar,
}: {
  summary: ReceivableSummary
  cents: number
  today: Date
  subtitle?: string
  onOpen: () => void
  onCobrar?: () => void
}) {
  const { receivable } = summary
  const estado = subtitle != null ? { text: subtitle, vencido: false } : estadoDeCobro(summary, today)

  return (
    <m.li {...ROW_PRESENCE} className="overflow-hidden">
      <div className="flex min-w-0 items-center gap-3 px-panel py-3 transition-colors duration-150 hover:bg-fill-subtle">
        <button type="button" onClick={onOpen} aria-label={`${receivable.name}: ver detalle`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar initials={initialsFrom(receivable.name, null)} size="sm" shape="square" tone="accent" />
          <span className="min-w-0 flex-1">
            {/* Nombre y estado envuelven en vez de truncar: a 320px con un importe de 7+ cifras a la
                derecha, «Familia grande» quedaba en «Familia …» (mismo hallazgo que las filas de Fijos). */}
            <span className="block text-[13.5px] font-semibold break-words text-fg">{receivable.name}</span>
            <span className={cn('mt-0.5 block text-[11.5px]', estado.vencido ? 'text-negative' : 'text-fg-muted')}>{estado.text}</span>
          </span>
          <Money cents={cents} size="row" className="shrink-0" />
        </button>
        {onCobrar ? (
          <IconSquare onClick={onCobrar} aria-label={`${receivable.name}: cobrar`}>
            <Plus className="size-3" strokeWidth={1.8} aria-hidden />
          </IconSquare>
        ) : (
          // Mismo ancho que el «+», para que los importes queden alineados.
          <span aria-hidden className="size-5 shrink-0" />
        )}
      </div>
    </m.li>
  )
}

function ListPanel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Panel className="pb-2">
      <div className="flex items-baseline justify-between gap-3 border-b border-divider px-panel pt-5 pb-3">
        <h2 className="font-display text-[14.5px] font-semibold text-fg">{title}</h2>
        {hint && <span className="text-[11.5px] text-fg-muted">{hint}</span>}
      </div>
      {children}
    </Panel>
  )
}

/** Línea de una cuota en un mes que no es el actual: cuál es, y si ya está cubierta. */
function cuotaSubtitle(c: CuotaDelMes, isPast: boolean): string {
  const n = c.summary.receivable.installments
  const cual = n > 1 ? `Cuota ${c.cuota}/${n}` : 'Pago único'
  if (c.faltaCents === 0) return `${cual} · ${isPast ? 'cobrada' : 'adelantada'}`
  if (c.faltaCents < c.cuotaCents) return `${cual} · faltan ${formatMoney(c.faltaCents)}`
  return cual
}

/** Rail: lo que falta cobrar en cada uno de los 3 meses siguientes al que se mira — tocar uno navega
 *  ahí. Misma pieza que «Próximos 3 meses» de Mis Deudas, pero como botones. */
function ProximosPanel({ months, onGo }: { months: { period: string; label: string; cents: number; pct: number }[]; onGo: (period: string) => void }) {
  return (
    <Panel className="p-panel">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Próximos 3 meses</p>
        <span className="text-[11.5px] text-fg-muted">a cobrar</span>
      </div>
      <div className="mt-3 flex flex-col">
        {months.map((mo) => (
          <button
            key={mo.period}
            type="button"
            onClick={() => onGo(mo.period)}
            aria-label={`Ver ${mo.label}`}
            className="-mx-2 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-semibold text-fg-muted capitalize">{mo.label}</span>
              <Money cents={mo.cents} size="row" tone="dim" />
            </span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-fill-subtle">
              <span className="block h-full rounded-full bg-border-strong" style={{ width: `${mo.pct}%` }} />
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

const periodOf = (date: Date) => format(startOfMonth(date), 'yyyy-MM-dd')
const shiftPeriod = (period: string, months: number) => periodOf(addMonths(parseISO(period), months))

/**
 * Navega por mes CALENDARIO, no por el ciclo del usuario como Fijos y Mis Deudas: las cuotas de una
 * deuda a favor son mensuales, y con un ciclo semanal «cobrás $33.333 esta semana» sería una cifra
 * inventada. El mes en curso es el único con «vencido» (lo que hay que reclamar ahora); en otro mes
 * se ven las cuotas que caen ahí — cubiertas o no, con los abonos imputados en orden — y lo que entró
 * en ese mes. Las sin fecha no caen en ningún mes: se listan aparte, sólo en el mes en curso.
 */
export function MeDeben() {
  const [formOpen, setFormOpen] = useState(false)
  // Id, no el objeto: `summary` se recalcula en cada render con datos frescos de la query, pero un
  // `ReceivableSummary` guardado tal cual en el estado queda pegado al momento del click — después
  // de cobrar, el panel seguía mostrando "Pendiente" y dejaba cobrarlo dos veces porque renderizaba
  // ese objeto viejo en vez de volver a buscarlo. Derivar por id en cada render lo evita.
  const [open, setOpen] = useState<{ id: string; view: 'detail' | 'cobrar' } | null>(null)
  const today = useToday()
  const currentPeriod = periodOf(today)
  const [viewed, setViewed] = useState(currentPeriod)
  const isCurrent = viewed === currentPeriod
  const isPast = viewed < currentPeriod

  const { data: receivables, isPending: isReceivablesPending, isError, refetch } = useReceivables()
  const { data: payments, isPending: isPaymentsPending } = useReceivablePayments()
  const isPending = isReceivablesPending || isPaymentsPending

  const summary = useMemo(() => summarizeReceivables(receivables ?? [], payments ?? [], today), [receivables, payments, today])
  const { todas, esteMes, sinFecha, aCobrarCents, vencidoCents, cobradoEsteMesCents, totalPendingCents } = summary

  const cuotas = useMemo(() => (isCurrent ? [] : cuotasDelMes(todas, viewed)), [todas, viewed, isCurrent])
  const cobrados = useMemo(() => cobradoEnMes(todas, viewed), [todas, viewed])
  const proximos = useMemo(() => {
    const raw = [1, 2, 3].map((i) => {
      const period = shiftPeriod(viewed, i)
      return {
        period,
        label: format(parseISO(period), 'MMMM yyyy', { locale: es }),
        cents: cuotasDelMes(todas, period).reduce((sum, c) => sum + c.faltaCents, 0),
      }
    })
    const max = Math.max(...raw.map((mo) => mo.cents), 1)
    return raw.map((mo) => ({ ...mo, pct: (mo.cents / max) * 100 }))
  }, [todas, viewed])

  // Mes en curso: lo que entró + lo que falta (con lo vencido). Otro mes: las cuotas que caen ahí,
  // cuánto de ellas ya está cubierto y cuánto no.
  const dueCents = cuotas.reduce((sum, c) => sum + c.cuotaCents, 0)
  const faltaCents = isCurrent ? aCobrarCents : cuotas.reduce((sum, c) => sum + c.faltaCents, 0)
  const cubiertoCents = isCurrent ? cobradoEsteMesCents : dueCents - faltaCents
  const totalCents = cubiertoCents + faltaCents
  const cubiertoPct = totalCents > 0 ? (cubiertoCents / totalCents) * 100 : 0
  const todoCubierto = faltaCents === 0 && cubiertoCents > 0

  const openSummary = open ? (todas.find((s) => s.receivable.id === open.id) ?? null) : null
  const hasAny = (receivables ?? []).length > 0
  const viewedDate = parseISO(viewed)
  const monthName = format(viewedDate, 'MMMM', { locale: es })
  const cobradoTotal = cobrados.reduce((sum, c) => sum + c.cents, 0)

  const openDetail = (s: ReceivableSummary) => setOpen({ id: s.receivable.id, view: 'detail' })
  const openCobrar = (s: ReceivableSummary) => setOpen({ id: s.receivable.id, view: 'cobrar' })
  const monthNav = (
    <MonthNav
      label={format(viewedDate, 'MMMM yyyy', { locale: es })}
      mobileLabel={monthName}
      onPrev={() => setViewed((p) => shiftPeriod(p, -1))}
      onNext={() => setViewed((p) => shiftPeriod(p, 1))}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-4">
        <div className="flex items-center justify-between gap-3 lg:hidden">
          <h1 className="font-display text-figure font-semibold">Me Deben</h1>
          {monthNav}
        </div>
        <div className="hidden lg:block">
          {monthNav}
          <h1 className="mt-2 font-display text-figure font-semibold">Me Deben</h1>
        </div>
        <div className="flex gap-2">
          <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={() => setFormOpen(true)} className="flex-1 lg:flex-none">
            Nueva deuda
          </Button>
        </div>
      </header>

      {isError ? (
        <Panel className="px-panel py-10">
          <ErrorState onRetry={() => refetch()} />
        </Panel>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col gap-4">
            <Panel className="flex flex-col gap-3 p-panel">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-2 w-full" />
            </Panel>
            <Panel className="flex flex-col gap-4 p-panel">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </Panel>
          </div>
          <Skeleton className="h-40 w-full rounded-panel" />
        </div>
      ) : !hasAny ? (
        <Panel>
          <EmptyState
            glyph="◷"
            title="Nadie te debe plata"
            hint="Cuando le prestes plata a alguien, anotala acá — en una o varias cuotas — para no olvidarte."
            action={<Button onClick={() => setFormOpen(true)}>Nueva deuda</Button>}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel className="flex flex-col gap-5 p-panel">
              <div>
                <p className="eyebrow">{isPast ? `Tocaba cobrar en ${monthName}` : `A cobrar en ${monthName}`}</p>
                {/* Todo lo del mes, cubierto o no — igual que «A pagar» en Mis Deudas: con sólo lo que
                    falta, el hero repetía «Falta cobrar» apenas entraba un cobro. */}
                <CountUpMoney cents={totalCents} size="hero" className="mt-1" />
              </div>
              {totalCents === 0 ? (
                <p className="text-[13px] text-fg-muted">No hay nada para cobrar en {monthName}.</p>
              ) : todoCubierto ? (
                <div className="flex items-center gap-2.5 text-[13.5px] font-semibold text-fg">
                  {/* Momento raro (todo cobrado en el mes): el único lugar de la pantalla con resorte,
                      mismo valor que «Todo pagado» en Fijos y Mis Deudas. */}
                  <m.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', duration: 0.45, bounce: 0.3, delay: 0.15 }}
                    className="grid size-6 place-items-center rounded-full bg-accent text-on-accent"
                  >
                    <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
                  </m.span>
                  {isCurrent || isPast ? `Todo cobrado en ${monthName}` : `Ya te adelantaron todo lo de ${monthName}`}
                </div>
              ) : isCurrent || isPast || cubiertoCents > 0 ? (
                <>
                  <StackedBar segments={[{ pct: cubiertoPct, color: 'var(--color-accent)' }]} />
                  <StatRow className="flex-wrap gap-x-7 gap-y-3">
                    {/* «Cubierto» en un mes pasado, no «Cobrado»: es cuánto de LAS CUOTAS de ese mes ya volvió (aunque
                        haya sido después), y no coincide con «Cobrado en …» del costado (lo que entró ese mes). */}
                    <Stat label={isCurrent ? 'Cobrado' : isPast ? 'Cubierto' : 'Adelantado'}>
                      <CountUpMoney cents={cubiertoCents} tone="accent" size="figure" />
                    </Stat>
                    <Stat label={isPast ? 'Sigue pendiente' : 'Falta cobrar'}>
                      <CountUpMoney cents={faltaCents} tone="fg" size="figure" />
                      {isCurrent && vencidoCents > 0 && <p className="mt-0.5 text-[11.5px] text-negative">{formatMoney(vencidoCents)} vencido</p>}
                    </Stat>
                  </StatRow>
                </>
              ) : null}
              <p className="text-[12px] text-fg-muted">En total te deben {formatMoney(totalPendingCents)} · No suma al saldo proyectado.</p>
            </Panel>

            {/* `key` por mes: navegar remonta la lista sin animar; dentro del mismo mes, cobrar saca la
                fila con la misma salida que en Fijos y Mis Deudas. */}
            {isCurrent
              ? esteMes.length > 0 && (
                  <ListPanel title="Este mes" hint="tocá + para cobrar">
                    <ul key={viewed}>
                      <AnimatePresence initial={false}>
                        {esteMes.map((s) => (
                          <ReceivableRow key={s.receivable.id} summary={s} cents={s.aCobrarCents} today={today} onOpen={() => openDetail(s)} onCobrar={() => openCobrar(s)} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </ListPanel>
                )
              : cuotas.length > 0 && (
                  <ListPanel title={`Cuotas de ${monthName}`}>
                    <ul key={viewed}>
                      <AnimatePresence initial={false}>
                        {cuotas.map((c) => (
                          <ReceivableRow
                            key={c.summary.receivable.id}
                            summary={c.summary}
                            cents={c.cuotaCents}
                            today={today}
                            subtitle={cuotaSubtitle(c, isPast)}
                            onOpen={() => openDetail(c.summary)}
                            onCobrar={c.faltaCents > 0 ? () => openCobrar(c.summary) : undefined}
                          />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </ListPanel>
                )}

            {isCurrent && sinFecha.length > 0 && (
              <ListPanel title="Sin fecha" hint="no sabés cuándo te las devuelven">
                <ul>
                  <AnimatePresence initial={false}>
                    {sinFecha.map((s) => (
                      <ReceivableRow key={s.receivable.id} summary={s} cents={s.pendingCents} today={today} onOpen={() => openDetail(s)} onCobrar={() => openCobrar(s)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </ListPanel>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {(isCurrent || isPast) && (
              <Panel>
                <div className="flex items-baseline justify-between gap-3 px-panel pt-5 pb-1">
                  <p className="eyebrow">Cobrado en {monthName}</p>
                  <Money cents={cobradoTotal} size="row" />
                </div>
                {cobrados.length === 0 ? (
                  <p className="px-panel pt-1 pb-5 text-[12.5px] text-fg-muted">
                    {isCurrent ? 'Todavía no te devolvieron nada este mes.' : `No te devolvieron nada en ${monthName}.`}
                  </p>
                ) : (
                  <ul className="flex min-w-0 flex-col pb-3">
                    {cobrados.map(({ summary: s, cents }) => (
                      <li key={s.receivable.id}>
                        <button
                          type="button"
                          onClick={() => openDetail(s)}
                          className="flex w-full min-w-0 items-center gap-2.5 px-panel py-[7px] text-left transition-colors duration-150 hover:bg-fill-subtle"
                        >
                          <span className="grid size-[18px] shrink-0 place-items-center rounded-[4px] bg-inverse text-on-inverse">
                            <Check className="size-2.5" strokeWidth={2} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 text-[12.5px] text-fg-secondary">
                            <span className="block truncate">{s.receivable.name}</span>
                            <span className="block text-[11.5px] text-fg-faint">{s.cobrada ? 'saldada' : `quedan ${formatMoney(s.pendingCents)}`}</span>
                          </span>
                          <Money cents={cents} tone="dim" size="row" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            {proximos.some((mo) => mo.cents > 0) && <ProximosPanel months={proximos} onGo={setViewed} />}
          </div>
        </div>
      )}

      {formOpen && <ReceivableFormDialog open onClose={() => setFormOpen(false)} />}
      {openSummary && open && (
        <ReceivableSheet
          // Otra deuda u otro punto de entrada = panel nuevo: no arrastra la vista ni el importe tipeado.
          key={`${open.id}-${open.view}`}
          open
          onClose={() => setOpen(null)}
          summary={openSummary}
          initialView={open.view}
        />
      )}
    </div>
  )
}
