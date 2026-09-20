import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger' | 'dangerSolid'
export type ButtonSize = 'sm' | 'compact' | 'md' | 'block' | 'dialogFooter' | 'auth'

// `base` es el aspecto normal y `disabled` el apagado. Van separados porque un botón `loading` es
// `disabled` (no acepta clicks) pero NO se ve apagado: conserva su color y sólo baja la opacidad —
// si los dos juegos de clases convivieran en el mismo string, `cn()` no dedupea y ganaría el que
// genere último el CSS.
const variants: Record<ButtonVariant, { base: string; disabled: string }> = {
  // `text-on-accent`, no `text-canvas`: con el sistema de tema nuevo el acento es azul en los dos
  // modos, así que el texto encima tiene que ser blanco fijo, no el color de canvas (que en dark
  // mode es casi negro y quedaría ilegible sobre el acento).
  primary: {
    base: 'bg-accent text-on-accent hover:bg-accent-hover active:opacity-80 font-semibold',
    disabled:
      'disabled:bg-fill-subtle disabled:text-fg-faint disabled:hover:bg-fill-subtle disabled:active:opacity-100',
  },
  ghost: {
    base: 'text-fg-secondary hover:text-fg hover:bg-fill-subtle',
    disabled: 'disabled:text-fg-faint disabled:hover:bg-transparent disabled:hover:text-fg-faint',
  },
  outline: {
    base: 'text-fg border border-border-strong hover:bg-fill-subtle',
    disabled: 'disabled:text-fg-faint disabled:hover:bg-transparent',
  },
  danger: {
    base: 'text-negative border border-negative/30 hover:bg-negative/10',
    disabled: 'disabled:text-fg-faint disabled:border-border disabled:hover:bg-transparent',
  },
  // Confirmar algo destructivo (Eliminar). `danger` es el outline discreto para ofrecerlo; éste es
  // el botón que lo ejecuta.
  dangerSolid: {
    base: 'bg-negative text-on-negative hover:bg-negative-hover active:opacity-80 font-semibold',
    disabled:
      'disabled:bg-fill-subtle disabled:text-fg-faint disabled:hover:bg-fill-subtle disabled:active:opacity-100',
  },
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  // La fila de acciones de cabecera (Exportar CSV · Categorías · + Nuevo movimiento en Movimientos,
  // y el mismo patrón en Fijos/Mis Deudas/Me Deben/Ahorros) — 38px, entre `sm` y `md`.
  compact: 'h-[38px] px-[15px] text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  // Botones apilados a todo el ancho de una tarjeta (Nueva cuenta / Transferir): 38px y 12.5px en el
  // celular como en el handoff (el toque sigue siendo de 44 por el `after` invisible) y 40 en escritorio.
  block:
    'relative h-[38px] w-full px-4 text-[12.5px] gap-2 max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:-inset-y-[3px] sm:h-10 sm:text-[13px]',
  // El footer de los 24 diálogos (arquetipos 1-3): 38px en escritorio como pide el mock, pero a
  // todo el ancho y 48px en mobile — las reglas transversales piden que ahí no queden los botones
  // chicos alineados a la derecha del escritorio. Todo en un solo `size` (no un className aparte)
  // porque el `cn()` del repo no dedupea: dos clases de alto/ancho compitiendo en el mismo string
  // tendrían un ganador impredecible.
  dialogFooter: 'h-12 w-full px-4 text-sm gap-2 sm:h-[38px] sm:w-auto sm:px-[15px] sm:text-[13px] sm:gap-1.5',
  // Botón único de las 5 pantallas de auth: siempre a todo el ancho de la tarjeta de 380px, y a
  // 48px en mobile (donde el panel ocupa todo el viewport) bajando a los 44px de siempre desde `sm`.
  auth: 'h-12 w-full px-5 text-sm gap-2 sm:h-11',
}

/**
 * Las clases sin el `<button>`, para cuando el control tiene que ser un `<Link>` de verdad
 * (navegación real, click derecho, abrir en pestaña nueva) y no un botón disfrazado.
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string; loading?: boolean } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-control whitespace-nowrap',
    'transition-colors duration-150',
    variants[variant].base,
    // Apagado: gris y `not-allowed`. Guardando: mismo color, más tenue y `progress`.
    loading ? 'disabled:cursor-progress disabled:opacity-75' : cn('disabled:cursor-not-allowed', variants[variant].disabled),
    sizes[size],
    className,
  )
}
