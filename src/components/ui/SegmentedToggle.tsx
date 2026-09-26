import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type SegmentedToggleVariant = 'control' | 'pill' | 'tabs'

interface SegmentedToggleProps<T extends string> {
  value: T
  options: readonly { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  /** `control` (default): radio 4px, cada opción con su propio borde — es un control de
   *  moneda/unidad (ARS/USD en Ahorros), no una etiqueta. `pill`: una sola pista `fill-subtle` con
   *  la opción activa flotando en `surface` — el Todos/Gastos/Ingresos de Movimientos. `tabs`: la
   *  misma idea que `pill` pero de 44px y esquinas de 10px, para cambiar de lista entera (las
   *  pestañas Gasto/Ingreso/Archivadas de `/categorias`, con su conteo al lado). */
  variant?: SegmentedToggleVariant
  className?: string
}

const trackClass: Record<SegmentedToggleVariant, string> = {
  control: 'gap-1',
  pill: 'gap-0.5 rounded-pill bg-fill-subtle p-[3px]',
  tabs: 'gap-0.5 rounded-[13px] bg-fill-subtle p-1',
}

// El tamaño de letra va por variante y no en la base del botón: `cn()` no dedupea, dos `text-[…]`
// competirían sin ganador fijo.
const optionClass: Record<SegmentedToggleVariant, { active: string; inactive: string }> = {
  control: {
    active: 'text-[12px] rounded-[4px] px-3 py-[5px] bg-inverse font-semibold text-on-inverse',
    inactive: 'text-[12px] rounded-[4px] px-3 py-[5px] border border-border text-fg-secondary hover:text-fg',
  },
  pill: {
    active: 'text-[12px] rounded-pill px-3.5 py-[5px] bg-surface font-semibold text-fg',
    inactive: 'text-[12px] rounded-pill px-3.5 py-[5px] text-fg-secondary hover:text-fg',
  },
  tabs: {
    active: 'text-[13.5px] h-9 rounded-[10px] px-1.5 sm:px-3.5 bg-surface font-semibold text-fg shadow-[0_1px_3px_rgba(0,0,0,.12)]',
    inactive: 'text-[13.5px] h-9 rounded-[10px] px-1.5 sm:px-3.5 font-semibold text-fg-secondary hover:text-fg',
  },
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  variant = 'control',
  className,
}: SegmentedToggleProps<T>) {
  return (
    <div className={cn('flex', trackClass[variant], className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            'transition-colors duration-150',
            // `pill` reparte el ancho de la pista entre sus opciones cuando la pista crece (ver
            // `className="flex-1 lg:flex-none"` del consumidor en Movimientos) — en escritorio
            // vuelve a medir lo que mide cada palabra, si no una pista `flex-none` (sin ancho
            // propio que repartir) con hijas de `flex-basis:0` no tiene de dónde sacar su tamaño.
            variant === 'pill' && 'flex-1 text-center lg:flex-none',
            variant === 'tabs' && 'flex flex-1 items-center justify-center gap-1.5 sm:flex-none',
            value === opt.value ? optionClass[variant].active : optionClass[variant].inactive,
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
