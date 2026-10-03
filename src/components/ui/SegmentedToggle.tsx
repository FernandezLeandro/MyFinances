import { useId } from 'react'
import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { cn } from '@/lib/cn'

type SegmentedToggleVariant = 'control' | 'pill' | 'tabs'

interface SegmentedToggleProps<T extends string> {
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  /** `control` (default): radio 4px, cada opción con su propio borde — es un control de
   *  moneda/unidad (ARS/USD en Ahorros), no una etiqueta. `pill`: una sola pista `fill-subtle` con
   *  la opción activa flotando en `surface`. `tabs`: la misma idea que `pill` pero de 44px y esquinas
   *  de 10px — el Todos/Gastos/Ingresos de Movimientos y de Filtros, y las pestañas
   *  Gasto/Ingreso/Archivadas de `/categorias`, con su conteo al lado. */
  variant?: SegmentedToggleVariant
  /** Opciones del mismo ancho que se reparten la pista entera (el Tipo del diálogo Filtros, que antes
   *  quedaba pegado a la izquierda desde `sm`). Es grilla de columnas `1fr`, no `flex-1`: en una pista
   *  sin ancho propio (`flex-none`) cada columna mide lo que la opción más larga, y en una ancha se
   *  estiran parejas. `1fr` y no `auto-cols-fr` (que es `minmax(0,1fr)`): las columnas nunca se
   *  achican por debajo de su texto. */
  fill?: boolean
  className?: string
}

const trackClass: Record<SegmentedToggleVariant, string> = {
  control: 'gap-1',
  pill: 'gap-0.5 rounded-pill bg-fill-subtle p-[3px]',
  tabs: 'gap-0.5 rounded-[13px] bg-fill-subtle p-1',
}

// El tamaño de letra va por variante y no en la base del botón: `cn()` no dedupea, dos `text-[…]`
// competirían sin ganador fijo. En `pill`/`tabs` el fondo de la activa no está acá: es `thumbClass`,
// una pieza aparte que se desliza de una opción a la otra.
const optionClass: Record<SegmentedToggleVariant, { active: string; inactive: string }> = {
  control: {
    active: 'text-[12px] rounded-[4px] px-3 py-[5px] bg-inverse font-semibold text-on-inverse',
    inactive: 'text-[12px] rounded-[4px] px-3 py-[5px] border border-border text-fg-secondary hover:text-fg',
  },
  pill: {
    active: 'text-[12px] rounded-pill px-3.5 py-[5px] font-semibold text-fg',
    inactive: 'text-[12px] rounded-pill px-3.5 py-[5px] text-fg-secondary hover:text-fg',
  },
  tabs: {
    active: 'text-[13.5px] h-9 rounded-[10px] px-1.5 sm:px-3.5 font-semibold text-fg',
    inactive: 'text-[13.5px] h-9 rounded-[10px] px-1.5 sm:px-3.5 font-semibold text-fg-secondary hover:text-fg',
  },
}

const thumbClass: Partial<Record<SegmentedToggleVariant, string>> = {
  pill: 'rounded-pill bg-surface',
  tabs: 'rounded-[10px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,.12)]',
}

// Movimiento en pantalla que el usuario puede disparar dos veces seguidas: resorte sin rebote, que
// retoma desde donde esté si lo interrumpen. Corto a propósito — se usa decenas de veces por día.
const thumbTransition = { type: 'spring', duration: 0.25, bounce: 0 } as const

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  variant = 'control',
  fill = false,
  className,
}: SegmentedToggleProps<T>) {
  // `layoutId` es global a la página: sin un id propio, dos segmentados a la vista (la barra de
  // Movimientos y el Tipo de Filtros) se pasarían el fondo de uno al otro.
  const thumbId = useId()
  const thumb = thumbClass[variant]

  return (
    <div className={cn(fill ? 'grid auto-cols-[1fr] grid-flow-col' : 'flex', trackClass[variant], className)}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'relative transition-colors duration-150',
              // `pill` reparte el ancho de la pista entre sus opciones cuando la pista crece — en
              // escritorio vuelve a medir lo que mide cada palabra, si no una pista `flex-none` (sin
              // ancho propio que repartir) con hijas de `flex-basis:0` no tiene de dónde sacar su
              // tamaño. Con `fill` lo resuelve la grilla.
              !fill && variant === 'pill' && 'flex-1 text-center lg:flex-none',
              variant === 'tabs' && 'flex items-center justify-center',
              !fill && variant === 'tabs' && 'flex-1 sm:flex-none',
              active ? optionClass[variant].active : optionClass[variant].inactive,
            )}
          >
            {thumb && active && (
              <m.span
                layoutId={thumbId}
                transition={thumbTransition}
                aria-hidden
                className={cn('absolute inset-0', thumb)}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
