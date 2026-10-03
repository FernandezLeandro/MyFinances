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
        // `after`: área táctil de 36×44 sin agrandar el cuadrado — el borde horizontal no pasa de 8px
        // porque en Ahorros el vecino queda a `gap-2`. El hundido al apretar (0.9, no 0.97: el control
        // es de 20px y un 3% no se vería) confirma el toque; un botón apagado no se hunde.
        'relative grid size-5 shrink-0 place-items-center rounded-[5px] transition-[color,background-color,opacity,transform] duration-150 ease-out-quint after:absolute after:-inset-x-2 after:-inset-y-3 active:scale-90 disabled:opacity-50 disabled:active:scale-100',
        active ? 'bg-accent text-on-accent' : 'bg-fill-subtle text-fg-muted hover:bg-border-strong hover:text-fg',
        className,
      )}
      {...aria}
    >
      {children}
    </button>
  )
}
