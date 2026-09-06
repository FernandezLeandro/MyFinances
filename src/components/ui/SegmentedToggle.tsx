import { cn } from '@/lib/cn'

interface SegmentedToggleProps<T extends string> {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}

/**
 * Toggle de 2+ opciones excluyentes con radio de 4px — más recto que `Chip` (999px) a propósito,
 * es un control de moneda/unidad, no una etiqueta. El toggle ARS/USD de Ahorros es el primer uso.
 */
export function SegmentedToggle<T extends string>({ value, options, onChange, className }: SegmentedToggleProps<T>) {
  return (
    <div className={cn('flex gap-1', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={cn(
            'rounded-[4px] px-3 py-[5px] text-[12px] transition-colors duration-150',
            value === opt.value
              ? 'bg-inverse font-semibold text-on-inverse'
              : 'border border-border text-fg-secondary hover:text-fg',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
