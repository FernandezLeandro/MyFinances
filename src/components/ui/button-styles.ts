import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'
export type ButtonSize = 'sm' | 'compact' | 'md' | 'dialogFooter'

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
  // La fila de acciones de cabecera (Exportar CSV · Categorías · + Nuevo movimiento en Movimientos,
  // y el mismo patrón en Fijos/Mis Deudas/Me Deben/Ahorros) — 38px, entre `sm` y `md`.
  compact: 'h-[38px] px-[15px] text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  // El footer de los 24 diálogos (arquetipos 1-3): 38px en escritorio como pide el mock, pero a
  // todo el ancho y 48px en mobile — las reglas transversales piden que ahí no queden los botones
  // chicos alineados a la derecha del escritorio. Todo en un solo `size` (no un className aparte)
  // porque el `cn()` del repo no dedupea: dos clases de alto/ancho compitiendo en el mismo string
  // tendrían un ganador impredecible.
  dialogFooter: 'h-12 w-full px-4 text-sm gap-2 sm:h-[38px] sm:w-auto sm:px-[15px] sm:text-[13px] sm:gap-1.5',
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
