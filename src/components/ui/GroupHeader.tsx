import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface GroupHeaderProps {
  label: string
  /** El total del grupo, a la derecha — Movimientos lo usa (total neto del día), Hoy no (sólo
   *  agrupa por "Hoy"/"Ayer", sin sumar). */
  total?: ReactNode
  className?: string
}

/** Encabezado de un grupo de filas — fecha o mes, con un total opcional a la derecha. */
export function GroupHeader({ label, total, className }: GroupHeaderProps) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4', className)}>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-fg-faint uppercase">{label}</p>
      {total}
    </div>
  )
}
