import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ChipProps {
  children: ReactNode
  /** Color de la categoría (cualquier color CSS). Pinta el punto y, si está activo, el borde. */
  color?: string
  active?: boolean
  onClick?: () => void
  className?: string
  /** Para chips cuya acción no es obvia por el texto visible (ej. quitar un filtro con una ✕ decorativa). */
  ariaLabel?: string
}

/**
 * Etiqueta densa de 4px de radio: categorías y filtros. El color de la categoría entra por un punto,
 * no pintando todo el fondo — así diez chips juntos no convierten la pantalla en un semáforo.
 */
export function Chip({ children, color, active = false, onClick, className, ariaLabel }: ChipProps) {
  const interactive = typeof onClick === 'function'
  const Tag = interactive ? 'button' : 'span'

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-[12px] leading-none whitespace-nowrap',
        'transition-colors duration-150',
        active ? 'bg-ink-700 text-chalk' : 'bg-ink-850 text-chalk-dim',
        interactive && 'hover:bg-ink-700 hover:text-chalk',
        className,
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </Tag>
  )
}
