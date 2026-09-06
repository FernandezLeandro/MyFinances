import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import type { MonthlyPoint } from '@/features/analytics/api'

const monthLabel = (period: string) => format(parseISO(period), 'MMM', { locale: es })

interface MonthlyEvolutionChartProps {
  data: MonthlyPoint[]
  /** `yyyy-MM-dd` (primer día del mes) del mes elegido en Análisis — su columna queda a opacidad
   *  plena y con el label en negrita, el resto de la ventana de 12 meses se atenúa. */
  highlightPeriod?: string
}

/**
 * Barras CSS puras, no Recharts: el mockup dibuja esto con `div`s de alto en `%` y así queda más
 * liviano — a diferencia de `CategoryDonut`, acá no hace falta tooltip con posicionamiento ni
 * accesibilidad de gráfico, un `title` nativo alcanza para ver el valor exacto al pasar el mouse.
 * Bonus: al ser `bg-accent`/`bg-negative` en vez de un hex de Recharts, el color ya resuelve solo
 * por tema — no hace falta pasar por `useChartColors()`.
 */
export function MonthlyEvolutionChart({ data, highlightPeriod }: MonthlyEvolutionChartProps) {
  const maxCents = Math.max(...data.flatMap((d) => [d.incomeCents, d.expenseCents]), 1)

  return (
    <div className="flex h-64 w-full items-end gap-3">
      {data.map((d) => {
        const isHighlight = !highlightPeriod || d.period === highlightPeriod
        return (
          <div key={d.period} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-[3px]">
              <span
                className="w-[11px] rounded-t-[3px] bg-accent"
                style={{ height: `${(d.incomeCents / maxCents) * 100}%`, opacity: isHighlight ? 1 : 0.35 }}
                title={`Ingresos: ${formatMoney(d.incomeCents)}`}
              />
              <span
                className="w-[11px] rounded-t-[3px] bg-negative"
                style={{ height: `${(d.expenseCents / maxCents) * 100}%`, opacity: isHighlight ? 1 : 0.35 }}
                title={`Gastos: ${formatMoney(d.expenseCents)}`}
              />
            </div>
            <span className={cn('shrink-0 text-[10.5px]', isHighlight ? 'font-bold text-fg' : 'text-fg-muted')}>
              {monthLabel(d.period)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
