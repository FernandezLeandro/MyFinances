import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ChipProps {
  children: ReactNode
  /** Al frente del texto — hoy sólo la ficha de categoría (`CategoryChip`, tamaño 16) de los
   *  filtros de Movimientos. Achica el padding izquierdo de `sm` para que quede pegada. */
  leading?: ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  /** Para chips cuya acción no es obvia por el texto visible (ej. quitar un filtro con una ✕ decorativa). */
  ariaLabel?: string
  /** `sm` (default): la etiqueta densa de categorías/filtros. `md`: un selector de pocas opciones
   *  dentro de un diálogo (tipo de cuenta, qué hacer con la diferencia). `lg`: un control de verdad
   *  — ej. el Gasto/Ingreso de "Nuevo movimiento", donde la elección es la primera decisión del
   *  formulario, no una entre diez chips juntos. */
  size?: 'sm' | 'md' | 'lg'
  /** Sólo con `size="lg"` y `active`: `ink` (default) es el fondo sólido de siempre; `danger` es el
   *  rojo suave del Gasto elegido y `accent` el borde de acento de la fecha elegida — ninguno de los
   *  dos "apaga" el resto de la fila como haría el fondo sólido. */
  activeTone?: 'ink' | 'danger' | 'accent'
}

const sizeClass: Record<NonNullable<ChipProps['size']>, string> = {
  sm: 'gap-1.5 rounded-chip py-1 text-[12px] leading-none',
  md: 'gap-1.5 rounded-chip-md px-3 py-2 text-[12.5px] leading-tight',
  lg: 'gap-1.5 rounded-pill border px-4 py-2 text-[14px] leading-none',
}

const lgActiveTone: Record<NonNullable<ChipProps['activeTone']>, string> = {
  ink: 'border-transparent bg-inverse font-semibold text-on-inverse',
  danger: 'border-transparent bg-badge-red-bg font-semibold text-badge-red-fg',
  accent: 'border-accent bg-accent-soft font-semibold text-accent-text',
}

/**
 * Etiqueta densa de 4px de radio: categorías y filtros. `leading` (la ficha de categoría) entra
 * pegado al texto, no pintando todo el fondo — así diez chips juntos no convierten la pantalla en
 * un semáforo.
 */
export function Chip({ children, leading, active = false, onClick, className, ariaLabel, size = 'sm', activeTone = 'ink' }: ChipProps) {
  const interactive = typeof onClick === 'function'
  const Tag = interactive ? 'button' : 'span'

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center whitespace-nowrap',
        'transition-colors duration-150',
        sizeClass[size],
        // `sm` no trae padding horizontal en `sizeClass` porque cambia con `leading`: sin ficha es
        // el `px-2` de siempre; con ficha, el margen izquierdo lo pone ella, así que el chip sólo
        // agrega el mínimo para no pegarla al borde.
        size === 'sm' && (leading ? 'pl-[3px] pr-2' : 'px-2'),
        size === 'lg'
          ? active
            ? lgActiveTone[activeTone]
            : 'border-border-strong bg-transparent text-fg'
          : active
            ? 'bg-inverse font-semibold text-on-inverse'
            : 'bg-fill-subtle text-fg-secondary',
        interactive && !active && (size === 'lg' ? 'hover:bg-fill-subtle' : 'hover:bg-border-strong hover:text-fg'),
        className,
      )}
    >
      {leading}
      {children}
    </Tag>
  )
}

interface FilterChipProps {
  children: ReactNode
  leading?: ReactNode
  onRemove: () => void
  /** Describe QUÉ filtro se quita, no sólo "quitar" — el chip en sí ya no lleva más texto que el
   *  valor del filtro, así que el lector de pantalla necesita este contexto. */
  removeLabel: string
}

/** `Chip` con una ✕ de quitar al final — los filtros activos de Movimientos. Antes cada chip
 *  repetía a mano el `<span aria-hidden>✕</span>`; acá queda en un solo lugar. */
export function FilterChip({ children, leading, onRemove, removeLabel }: FilterChipProps) {
  return (
    <Chip leading={leading} onClick={onRemove} ariaLabel={removeLabel}>
      {children}{' '}
      <span aria-hidden className="text-fg-muted">
        ✕
      </span>
    </Chip>
  )
}
