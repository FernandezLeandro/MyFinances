import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type BadgeVariant = 'soft' | 'outline'

// Cada variant define su clase completa (radio, padding, tamaño) en vez de compartir una base:
// `cn` no dedupe (ver trampa conocida #4), así que mezclar `rounded-pill` con `rounded-[4px]` de
// una variante a otra tendría un ganador impredecible.
const variants: Record<BadgeVariant, string> = {
  // Fondo suave del acento — "+18% vs. agosto" en Saldo actual.
  soft: 'rounded-pill bg-accent-soft px-2 py-[3px] text-[11.5px] font-semibold text-accent-text',
  // Borde fino, sin fondo — "No cuenta en el total" (Ahorros), "Descontado" (Me Deben).
  outline: 'rounded-[4px] border border-border px-1.5 py-[2px] text-[10.5px] font-semibold text-fg-muted',
}

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

/** Pastilla chica de estado — no confundir con `Chip` (interactivo, categorías/filtros). */
export function Badge({ children, variant = 'soft', className }: BadgeProps) {
  return <span className={cn('inline-flex items-center leading-none', variants[variant], className)}>{children}</span>
}
