import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface AccordionHeaderProps {
  label: string
  expanded: boolean
  onToggle: () => void
  /** Nodo opcional al extremo derecho, antes de la flecha — el total de "Cobradas (3)" en Me Deben.
   *  Movimientos no lo usa. */
  extra?: ReactNode
  className?: string
}

/** Cabecera de un grupo colapsable — "Pagados (8)" en Fijos, "Cobradas (3)" en Me Deben. Colapsado
 *  por default; el `›` gira 90° al expandir. */
export function AccordionHeader({ label, expanded, onToggle, extra, className }: AccordionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn('eyebrow flex w-full items-center justify-between gap-3 text-left transition-colors duration-150 hover:text-fg', className)}
    >
      <span className="flex items-center gap-1.5">
        <ChevronRight
          className={cn('size-2.5 shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
          strokeWidth={1.5}
          aria-hidden
        />
        {label}
      </span>
      {extra}
    </button>
  )
}
