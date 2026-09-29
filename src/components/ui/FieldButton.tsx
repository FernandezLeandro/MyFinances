import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

interface FieldButtonProps {
  id?: string
  /** Ícono suelto (18px, sin caja) — el componente lo pone en su propio cuadrado `fill-subtle`. */
  icon: ReactNode
  label: string
  /** Texto chico a la derecha, antes del chevron — el saldo de una cuenta, "hoy", un rango de fechas. */
  value?: ReactNode
  /** Sin elegir todavía (ej. "Elegí una cuenta"): atenuado, sin negrita. */
  placeholder?: boolean
  open?: boolean
  onClick: () => void
  ariaLabel?: string
  className?: string
}

/**
 * Campo-botón de 54px que abre un desplegable propio (rediseño de modales v2): cuadrado de ícono,
 * título, un dato chico a la derecha y el chevron. Extraído del trigger por defecto de
 * `AccountSelect` para reusarlo donde el desplegable no es una cuenta — Fecha de Pagar fijo, Período
 * de Filtros.
 */
export const FieldButton = forwardRef<HTMLButtonElement, FieldButtonProps>(function FieldButton(
  { id, icon, label, value, placeholder, open = false, onClick, ariaLabel, className },
  ref,
) {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'flex h-[54px] w-full items-center gap-2.5 rounded-control border pr-3 pl-2 text-left text-fg transition-colors duration-150',
        open ? 'border-accent ring-4 ring-accent-soft' : 'border-border-strong',
        className,
      )}
    >
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-fill-subtle text-fg-secondary">
        {icon}
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-[14.5px] font-semibold', placeholder && 'font-medium text-fg-muted')}>
        {label}
      </span>
      {value && <span className="shrink-0 text-[13px] text-fg-secondary tabular-nums">{value}</span>}
      <ChevronDown className={cn('size-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} aria-hidden />
    </button>
  )
})
