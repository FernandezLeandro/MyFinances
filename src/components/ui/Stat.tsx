import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface StatProps {
  label: string
  /** Al lado del label — típicamente un `<Badge>` de variación, o un `<EyeToggle>`. */
  labelAddon?: ReactNode
  /** El valor en sí — casi siempre un `<Money>`, con el tone/size que decida quien lo usa. */
  children: ReactNode
  className?: string
}

/**
 * Label en eyebrow + valor debajo — la anatomía que se repite en "Saldo actual" (con el hero
 * abajo), "Ingresos"/"Gastos" del flujo del mes, y las cifras de cabecera de cualquier tarjeta
 * bento. Deliberadamente no fuerza el tamaño del valor: cada instancia es una cifra de una escala
 * distinta (hero/figure), así que el `<Money size="...">` lo decide quien compone el `Stat`.
 */
export function Stat({ label, labelAddon, children, className }: StatProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <p className="eyebrow">{label}</p>
        {labelAddon}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

interface StatRowProps {
  children: ReactNode
  className?: string
}

/** Fila de `Stat`s lado a lado — Ingresos/Gastos bajo "Flujo del mes". */
export function StatRow({ children, className }: StatRowProps) {
  return <div className={cn('flex gap-8', className)}>{children}</div>
}
