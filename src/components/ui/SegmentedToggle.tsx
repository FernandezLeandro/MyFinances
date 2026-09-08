import { cn } from '@/lib/cn'

type SegmentedToggleVariant = 'control' | 'pill'

interface SegmentedToggleProps<T extends string> {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  /** `control` (default): radio 4px, cada opción con su propio borde — es un control de
   *  moneda/unidad (ARS/USD en Ahorros), no una etiqueta. `pill`: una sola pista `fill-subtle` con
   *  la opción activa flotando en `surface` — el Todos/Gastos/Ingresos de Movimientos. */
  variant?: SegmentedToggleVariant
  className?: string
}

const trackClass: Record<SegmentedToggleVariant, string> = {
  control: 'gap-1',
  pill: 'gap-0.5 rounded-pill bg-fill-subtle p-[3px]',
}

const optionClass: Record<SegmentedToggleVariant, { active: string; inactive: string }> = {
  control: {
    active: 'rounded-[4px] px-3 py-[5px] bg-inverse font-semibold text-on-inverse',
    inactive: 'rounded-[4px] px-3 py-[5px] border border-border text-fg-secondary hover:text-fg',
  },
  pill: {
    active: 'rounded-pill px-3.5 py-[5px] bg-surface font-semibold text-fg',
    inactive: 'rounded-pill px-3.5 py-[5px] text-fg-secondary hover:text-fg',
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
            'text-[12px] transition-colors duration-150',
            value === opt.value ? optionClass[variant].active : optionClass[variant].inactive,
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
