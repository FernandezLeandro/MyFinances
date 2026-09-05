import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'soft'

const variants: Record<BadgeVariant, string> = {
  // Fondo suave del acento — "+18% vs. agosto" en Saldo actual. Único variant por ahora; el
  // "outlined micro" de Ahorros/Me Deben ("No cuenta en el total", "Descontado") se suma cuando
  // se lleguen esas pantallas.
  soft: 'bg-accent-soft text-accent-text',
}

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

/** Pastilla chica de estado — no confundir con `Chip` (interactivo, categorías/filtros). */
export function Badge({ children, variant = 'soft', className }: BadgeProps) {
  return (
    <span
      className={cn('rounded-pill px-2 py-[3px] text-[11.5px] leading-none font-semibold', variants[variant], className)}
    >
      {children}
    </span>
  )
}
