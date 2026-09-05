import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PillTabProps {
  active: boolean
  onClick: () => void
  children: ReactNode
}

/** Un tab — Fijos/Mis Deudas/Me Deben (`PendientesTabs`), Mes/Trimestre/Año/Personalizado en
 *  Análisis. Radio 999px y fondo invertido cuando está activo, a diferencia de `Chip` (radio 4px,
 *  para categorías/filtros). */
export function PillTab({ active, onClick, children }: PillTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-pill px-3.5 py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-150',
        active ? 'bg-inverse font-semibold text-on-inverse' : 'text-fg-secondary hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

export function PillTabs({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex gap-1', className)}>{children}</div>
}
