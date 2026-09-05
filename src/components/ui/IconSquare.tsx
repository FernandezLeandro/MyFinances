import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface IconSquareProps {
  children: ReactNode
  /** Estado "hecho" — fondo de acento en vez del fill neutro (ver el check de un fijo pagado). */
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
}

/**
 * Cuadrado chico de acción — el "+" para cargar una bolsa, el check de un fijo pagado, el "+" de
 * abono en Me Deben. 20px, radio 5px: más recto que un `Chip`, a propósito — es un control denso,
 * no una etiqueta.
 */
export function IconSquare({ children, active = false, onClick, disabled, className, ...aria }: IconSquareProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors duration-150 disabled:opacity-50',
        active ? 'bg-acid text-on-accent' : 'bg-ink-800 text-chalk-faint hover:bg-ink-700 hover:text-chalk',
        className,
      )}
      {...aria}
    >
      {children}
    </button>
  )
}
