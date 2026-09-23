import { cn } from '@/lib/cn'

export interface StackedBarSegment {
  /** 0–100. La suma de todos los segmentos no tiene por qué dar exactamente 100 — el que sobra
   *  queda como track visible (ver "Composición" en Ahorros, que sí suma 100). */
  pct: number
  /** Color CSS — literal o `var(--color-...)`, para poder usar tokens que no tienen utilidad
   *  Tailwind directa en este contexto (ej. el acento vs. negativo del flujo del mes). */
  color: string
}

/**
 * Barra de proporción — "Flujo del mes" en Hoy (ingresos vs. gastos) y "Composición" en Ahorros
 * (ARS vs. USD). Track redondeado con `overflow-hidden`: los segmentos son `span`s sin radio propio,
 * las puntas redondeadas salen solas del contenedor.
 */
export function StackedBar({
  segments,
  thin = false,
  className,
}: {
  segments: StackedBarSegment[]
  /** 8px sobre `fill-subtle` en lugar de 12px sobre `divider` — la composición del total de Cuentas.
   *  Es una prop y no un `className` porque `cn()` no dedupea: alto y fondo competirían. */
  thin?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex overflow-hidden rounded-pill', thin ? 'h-2 bg-fill-subtle' : 'h-3 bg-divider', className)}>
      {segments.map((s, i) => (
        <span key={i} className="h-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
      ))}
    </div>
  )
}
