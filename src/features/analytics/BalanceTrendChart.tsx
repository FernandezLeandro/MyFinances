import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Money } from '@/components/ui/Money'
import { formatCompact } from '@/lib/money'
import { useChartColors, type ChartColorSet } from '@/lib/chartColors'
import type { MonthlyPoint } from '@/features/analytics/api'

const monthLabel = (period: string) => format(parseISO(period), 'MMM', { locale: es })

// Factory, no un componente fijo: el tooltip necesita los colores del tema activo, y Recharts lo
// instancia internamente sin pasarle props propias — el mismo patrón que `CategoryDonut.makeTooltip`.
function makeTooltip(colors: ChartColorSet) {
  return function CustomTooltip({ active, payload }: TooltipContentProps) {
    if (!active || !payload?.length) return null
    const point = payload[0]?.payload as MonthlyPoint | undefined
    if (!point) return null
    return (
      <div
        className="rounded-control px-3 py-2.5 text-[12px] shadow-lift ring-1"
        style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipRing }}
      >
        <p className="eyebrow mb-1.5">{format(parseISO(point.period), 'MMMM yyyy', { locale: es })}</p>
        <Money cents={point.runningBalanceCents} tone="acid" />
      </div>
    )
  }
}

interface BalanceTrendChartProps {
  data: MonthlyPoint[]
  /** `yyyy-MM-dd` (primer día del mes) del mes elegido en Análisis — se marca con una línea
   *  punteada para ubicarlo dentro de la ventana fija de 12 meses. */
  highlightPeriod?: string
}

export function BalanceTrendChart({ data, highlightPeriod }: BalanceTrendChartProps) {
  const gradientId = useId()
  const colors = useChartColors()

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={colors.grid} />
          <XAxis
            dataKey="period"
            tickFormatter={monthLabel}
            tick={{ fill: colors.fgMuted, fontSize: 11 }}
            axisLine={{ stroke: colors.grid }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: colors.fgMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            // El dominio siempre incluye el 0: además de servir de referencia, evita que con un
            // solo mes de datos Recharts arme un rango tan angosto que los 4 ticks redondeen al
            // mismo valor (p.ej. "-19k" repetido).
            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
          />
          <Tooltip content={makeTooltip(colors)} cursor={{ stroke: colors.accent, strokeWidth: 1 }} />
          {highlightPeriod && <ReferenceLine x={highlightPeriod} stroke={colors.fgMuted} strokeDasharray="3 3" />}
          <Area
            type="monotone"
            dataKey="runningBalanceCents"
            stroke={colors.accent}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
