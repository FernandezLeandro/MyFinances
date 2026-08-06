import { useId } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Money } from '@/components/ui/Money'
import { formatCompact } from '@/lib/money'
import { chartColors } from '@/lib/chartColors'
import type { MonthlyPoint } from '@/features/analytics/api'

const monthLabel = (period: string) => format(parseISO(period), 'MMM', { locale: es })

function CustomTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as MonthlyPoint | undefined
  if (!point) return null
  return (
    <div
      className="rounded-control px-3 py-2.5 text-[12px] shadow-lift ring-1"
      style={{ backgroundColor: chartColors.inkTooltip, borderColor: chartColors.inkTooltipRing }}
    >
      <p className="eyebrow mb-1.5">{format(parseISO(point.period), 'MMMM yyyy', { locale: es })}</p>
      <Money cents={point.runningBalanceCents} tone="acid" />
    </div>
  )
}

export function BalanceTrendChart({ data }: { data: MonthlyPoint[] }) {
  const gradientId = useId()

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColors.acid} stopOpacity={0.35} />
              <stop offset="100%" stopColor={chartColors.acid} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartColors.inkGrid} />
          <XAxis
            dataKey="period"
            tickFormatter={monthLabel}
            tick={{ fill: chartColors.chalkFaint, fontSize: 11 }}
            axisLine={{ stroke: chartColors.inkGrid }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: chartColors.chalkFaint, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            // El dominio siempre incluye el 0: además de servir de referencia, evita que con un
            // solo mes de datos Recharts arme un rango tan angosto que los 4 ticks redondeen al
            // mismo valor (p.ej. "-19k" repetido).
            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
          />
          <Tooltip content={CustomTooltip} cursor={{ stroke: chartColors.acid, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="runningBalanceCents"
            stroke={chartColors.acid}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
