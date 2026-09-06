import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'sm' | 'md'

const variants: Record<ButtonVariant, string> = {
  // `text-on-accent`, no `text-canvas`: con el sistema de tema nuevo el acento es azul en los dos
  // modos, así que el texto encima tiene que ser blanco fijo, no el color de canvas (que en dark
  // mode es casi negro y quedaría ilegible sobre el acento). Feedback de hover/active por opaccentad,
  // sin depender de un segundo tono de acento — ver la nota de interacciones del handoff.
  primary: 'bg-accent text-on-accent hover:opacity-90 active:opacity-80 font-semibold',
  ghost: 'text-fg-secondary hover:text-fg hover:bg-fill-subtle',
  outline: 'text-fg border border-border-strong hover:bg-fill-subtle',
  danger: 'text-negative border border-negative/30 hover:bg-negative/10',
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
