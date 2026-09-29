import { useRef } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { dateShortcut } from '@/features/transactions/formHelpers'

/**
 * Fecha como atajos Hoy / Ayer / Otra fecha (esta última abre el selector nativo y después muestra
 * el día elegido). La elegida va en tinta (rediseño de modales v2). El `<input type="date">` real es
 * `sr-only`, no `display:none`, para que `showPicker()` siga funcionando.
 */
export function DateShortcuts({
  value,
  onChange,
  min,
  today,
  max,
}: {
  /** `yyyy-MM-dd`. */
  value: string
  onChange: (value: string) => void
  /** Hoy en `yyyy-MM-dd`: contra qué se decide Hoy/Ayer. */
  today: string
  min?: string
  max?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shortcut = value ? dateShortcut(value, today) : 'other'

  return (
    <div role="group" aria-label="Fecha" className="flex flex-wrap gap-2">
      <Chip size="lg" activeTone="ink" active={shortcut === 'today'} onClick={() => onChange(today)}>
        Hoy
      </Chip>
      <Chip
        size="lg"
        activeTone="ink"
        active={shortcut === 'yesterday'}
        onClick={() => onChange(format(subDays(parseISO(today), 1), 'yyyy-MM-dd'))}
      >
        Ayer
      </Chip>
      <Chip
        size="lg"
        activeTone="ink"
        active={shortcut === 'other'}
        leading={<Calendar className="size-3.5" strokeWidth={1.8} aria-hidden />}
        onClick={() => {
          const el = inputRef.current
          if (el && typeof el.showPicker === 'function') el.showPicker()
          else el?.focus()
        }}
      >
        {shortcut === 'other' && value ? format(parseISO(value), 'd MMM', { locale: es }) : 'Otra fecha'}
      </Chip>
      <input
        ref={inputRef}
        type="date"
        className="sr-only"
        tabIndex={-1}
        aria-label="Otra fecha"
        min={min}
        max={max}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </div>
  )
}
