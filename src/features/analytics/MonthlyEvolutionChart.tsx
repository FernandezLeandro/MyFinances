import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
      <div className="flex items-center justify-between gap-4">
        <span className="text-chalk-dim">Ingresos</span>
        <Money cents={point.incomeCents} tone="acid" />
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-chalk-dim">Gastos</span>
        <Money cents={point.expenseCents} tone="coral" />
      </div>
    </div>
  )
}

export function MonthlyEvolutionChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4}>
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
          />
          <Tooltip content={CustomTooltip} cursor={{ fill: chartColors.inkGrid }} />
          <Bar dataKey="incomeCents" fill={chartColors.acid} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="expenseCents" fill={chartColors.coral} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
