import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'sm' | 'md'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-acid text-ink-950 hover:bg-acid-soft active:bg-acid-deep font-semibold',
  ghost: 'text-chalk-dim hover:text-chalk hover:bg-ink-800',
  outline: 'text-chalk border border-ink-600 hover:border-ink-500 hover:bg-ink-850',
  danger: 'text-coral border border-coral/30 hover:bg-coral/10',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
}

/**
 * Las clases sin el `<button>`, para cuando el control tiene que ser un `<Link>` de verdad
 * (navegación real, click derecho, abrir en pestaña nueva) y no un botón disfrazado.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-control whitespace-nowrap',
    'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    sizes[size],
    className,
  )
}
