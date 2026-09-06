import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface AccordionHeaderProps {
  label: string
  expanded: boolean
  onToggle: () => void
  className?: string
}

/** Cabecera de un grupo colapsable — "Pagados (8)" en Fijos, "Cobradas (3)" en Me Deben. Colapsado
 *  por default; el `›` gira 90° al expandir. */
export function AccordionHeader({ label, expanded, onToggle, className }: AccordionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn('eyebrow flex w-full items-center gap-1.5 text-left transition-colors duration-150 hover:text-fg', className)}
    >
      <ChevronRight
        className={cn('size-2.5 shrink-0 transition-transform duration-150', expanded && 'rotate-90')}
        strokeWidth={1.5}
        aria-hidden
      />
      {label}
    </button>
  )
}
