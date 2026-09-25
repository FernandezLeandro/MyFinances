import { format, getDate, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/Badge'
import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import {
  fixedExpenseUrgency,
  upcomingSavedCents,
  type FixedExpenseStatus,
  type FixedExpenseUrgency,
} from '@/features/fixed-expenses/aggregate'

const urgencyBadgeVariant: Record<FixedExpenseUrgency, 'red' | 'amber' | 'neutral'> = {
  red: 'red',
  amber: 'amber',
  neutral: 'neutral',
}

const urgencyDotClass: Record<FixedExpenseUrgency, string> = {
  red: 'bg-negative',
  amber: 'bg-badge-amber-fg',
  neutral: 'bg-border-strong',
}

function urgencyTag(dueDay: number, urgency: FixedExpenseUrgency): string {
  if (urgency === 'red') return 'Venció'
  if (urgency === 'amber') return 'Esta semana'
  return `Vence el ${dueDay}`
}

interface UpcomingFixedRowProps {
  status: FixedExpenseStatus
  today: Date
  /** Bloque 4 del plan de ciclos: con una semana a caballo de dos meses, un mismo fijo puede
   *  listarse dos veces (una instancia por mes) — se muestra cuál para desambiguar. */
  showMonthLabel: boolean
  hidden: boolean
  /** HO-07 del QA de Hoy: Vencimientos (escritorio) y Próximos vencimientos (mobile) eran dos JSX
   *  casi idénticos con un tope de "guardado" distinto — la duplicación era la causa de fondo del
   *  bug. Ahora es la misma fila, sólo con tipografía y alineación levemente más compactas en
   *  mobile. */
  dense?: boolean
}

/** Una fila de "vence el D · $importe", compartida entre el panel de escritorio y el de mobile de
 *  Hoy (ver `UpcomingFixedRowProps.dense`). */
export function UpcomingFixedRow({ status, today, showMonthLabel, hidden, dense = false }: UpcomingFixedRowProps) {
  // L2 del QA: el día REAL del vencimiento este mes, no `fe.due_day` crudo — un fijo con `due_day` 31
  // en septiembre (30 días) mostraba «Vence el 31» en vez de «Vence el 30».
  const dueDay = getDate(parseISO(status.dueDate as string))
  const urgency = fixedExpenseUrgency(parseISO(status.dueDate as string), today)
  const monthLabel = showMonthLabel ? format(parseISO(status.period), 'MMM', { locale: es }) : null

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', urgencyDotClass[urgency])} />
      <div className={cn('min-w-0', !dense && 'flex-1')}>
        <span className={cn('block truncate font-semibold text-fg', dense ? 'text-[13px]' : 'text-[12.5px]')}>
          {status.fe.name}
          {monthLabel && <span className="font-normal text-fg-muted"> · {monthLabel}</span>}
        </span>
        {/* Sólo si ya guardó algo — no vale la pena una línea en $0 por cada fijo pendiente. */}
        {status.savedCents > 0 && (
          <span className="block text-[11px] text-fg-muted">
            <Money cents={upcomingSavedCents(status)} tone="dim" size="inline" hidden={hidden} /> guardado
          </span>
        )}
      </div>
      <Badge variant={urgencyBadgeVariant[urgency]} className={dense ? 'shrink-0' : undefined}>
        {urgencyTag(dueDay, urgency)}
      </Badge>
      <Money
        cents={status.remainingCents}
        tone="fg"
        size="row"
        className={dense ? 'ml-auto shrink-0' : undefined}
        hidden={hidden}
      />
    </li>
  )
}
