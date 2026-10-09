import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { Money } from '@/components/ui/Money'
import { useChartColors, type ChartColorSet } from '@/lib/chartColors'

export interface InvestedBar {
  label: string
  cents: number
}

function makeTooltip(colors: ChartColorSet) {
  return function BarTooltip({ active, payload }: TooltipContentProps) {
    if (!active || !payload?.length) return null
    const bar = payload[0]?.payload as InvestedBar
    return (
      <div className="rounded-control px-3 py-2 text-[12px] shadow-lift ring-1" style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipRing }}>
        <p className="mb-0.5 text-fg">{bar.label}</p>
        <Money cents={bar.cents} tone="dim" />
      </div>
    )
  }
}

/** Lo invertido en cada tramo del período (días, semanas, meses o años). Una sola serie, en el acento. */
export function InvestedChart({ data }: { data: InvestedBar[] }) {
  const colors = useChartColors()

  return (
    <div className="h-[180px] w-full" role="img" aria-label="Lo invertido en cada tramo del período">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} interval="preserveStartEnd" tick={{ fill: colors.fgMuted, fontSize: 11 }} />
          <Tooltip content={makeTooltip(colors)} cursor={{ fill: colors.grid, opacity: 0.5 }} />
          <Bar dataKey="cents" fill={colors.accent} radius={[4, 4, 0, 0]} isAnimationActive="auto" animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
