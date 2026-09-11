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

/** Total del centro, redondeado al peso — mostrar los centavos ahí (como en el resto de la app)
 *  hace que la cifra se coma el círculo con montos de más de 6 dígitos; el mockup tampoco los
 *  muestra ("$ 264.334", sin decimales). */
function formatWhole(cents: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

/**
 * Tamaño de fuente del total central, en px. Un total de 9 cifras ("$ 2.660.512") es bastante más
 * ancho que el "$ 264.334" del mockup — con un tamaño fijo se sale del agujero del donut. En vez de
 * eso, se escala hacia abajo según el largo del texto (ancho de agujero ≈ 65% del diámetro, ancho
 * de dígito tabular en Sora bold ≈ 0.6 veces el tamaño de fuente), con un piso legible.
 */
function fitFontSize(size: number, label: string): number {
  const holeDiameter = size * 0.65
  const maxFontSize = size * 0.125
  const fitted = (holeDiameter * 0.82) / (label.length * 0.6)
  return Math.max(13, Math.min(maxFontSize, fitted))
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
        <p className="mb-0.5 text-fg">{slice.categoryName}</p>
        <div className="flex items-baseline gap-2">
          <Money cents={slice.cents} tone="dim" />
          <span className="tnum text-[11px] text-fg-muted">{(share * 100).toFixed(0)}%</span>
        </div>
      </div>
    )
  }
}

interface CategoryDonutProps {
  data: DonutSlice[]
  onSelect?: (categoryId: string) => void
  /** Etiqueta bajo la cifra central, p.ej. "gasto del mes" (Análisis). Sin esto no se dibuja el
   *  total en el centro — así `CompositionView` (Ahorros), que no lo necesita, no cambia. */
  centerLabel?: string
  /** Diámetro en px. 178 (el del mockup) por default, pensado para el uso angosto de
   *  `CompositionView`. Análisis pide uno más grande para no verse chico al lado de la lista de
   *  categorías, que en la práctica suele tener más de las 6 filas del mockup. */
  size?: number
  /** Ahorros (15a) muestra el activo más grande en el centro ("Dólar · 61%"), no el total — eyebrow
   *  arriba, cifra grande abajo (orden inverso al default de arriba). Pisa `centerLabel` cuando está
   *  presente; ninguna otra pantalla lo usa. */
  centerOverride?: { eyebrow: string; value: string }
}

export function CategoryDonut({ data, onSelect, centerLabel, size = 178, centerOverride }: CategoryDonutProps) {
  const colors = useChartColors()
  const totalCents = data.reduce((sum, s) => sum + s.cents, 0)
  const totalLabel = formatWhole(totalCents)

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
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
            innerRadius="65%"
            outerRadius="99%"
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
      {centerOverride ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-fg-muted uppercase">{centerOverride.eyebrow}</span>
          <span className="tnum font-display text-[22px] font-semibold text-fg" style={{ letterSpacing: '-0.02em' }}>
            {centerOverride.value}
          </span>
        </div>
      ) : (
        centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-3 text-center">
            <span
              className="tnum font-display font-bold text-fg"
              style={{ fontSize: fitFontSize(size, totalLabel), letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              {totalLabel}
            </span>
            <span className="text-[10.5px] tracking-[0.08em] text-fg-muted uppercase">{centerLabel}</span>
          </div>
        )
      )}
    </div>
  )
}
