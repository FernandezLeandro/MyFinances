import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { Money } from '@/components/ui/Money'
import { useChartColors, type ChartColorSet } from '@/lib/chartColors'

export interface DonutSlice {
  categoryId: string
  categoryName: string
  color: string
  cents: number
}

// Factory en vez de un componente fijo: el tooltip necesita el total para calcular el % de la
// porción que se está mirando (depende de `data`, que varía por instancia del donut) y los colores
// del tema activo — ninguno de los dos está disponible cuando Recharts instancia el tooltip solo.
function makeTooltip(totalCents: number, colors: ChartColorSet) {
  return function CustomTooltip({ active, payload }: TooltipContentProps) {
    if (!active || !payload?.length) return null
    const slice = payload[0]?.payload as DonutSlice
    const share = totalCents > 0 ? slice.cents / totalCents : 0
    return (
      <div
        className="rounded-control px-3 py-2 text-[12px] shadow-lift ring-1"
        style={{ backgroundColor: colors.tooltipBg, borderColor: colors.tooltipRing }}
      >
        <p className="mb-0.5 text-chalk">{slice.categoryName}</p>
        <div className="flex items-baseline gap-2">
          <Money cents={slice.cents} tone="dim" />
          <span className="tnum text-[11px] text-chalk-faint">{(share * 100).toFixed(0)}%</span>
        </div>
      </div>
    )
  }
}

interface CategoryDonutProps {
  data: DonutSlice[]
  onSelect?: (categoryId: string) => void
}

export function CategoryDonut({ data, onSelect }: CategoryDonutProps) {
  const colors = useChartColors()
  const totalCents = data.reduce((sum, s) => sum + s.cents, 0)

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="cents"
            nameKey="categoryName"
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius={64}
            outerRadius={98}
            paddingAngle={data.length > 1 ? 3 : 0}
            stroke="none"
            onClick={onSelect ? (entry) => onSelect((entry as unknown as DonutSlice).categoryId) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          >
            {data.map((slice) => (
              <Cell key={slice.categoryId} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip content={makeTooltip(totalCents, colors)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
