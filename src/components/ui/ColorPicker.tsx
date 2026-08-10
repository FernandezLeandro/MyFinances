import { useId } from 'react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  className?: string
}

/** Color libre: swatch que abre el `<input type="color">` nativo del sistema, más un campo de texto
 *  para pegar/tipear el hex a mano. Los dos controles quedan siempre en sync entre sí. */
export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const id = useId()

  function handleHexInput(raw: string) {
    const hex = raw.startsWith('#') ? raw : `#${raw}`
    onChange(hex)
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <label
        htmlFor={id}
        aria-label="Elegir color"
        className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-ink-700"
        style={{ backgroundColor: HEX_RE.test(value) ? value : undefined }}
      >
        <input
          id={id}
          type="color"
          value={HEX_RE.test(value) ? value : '#5FD3C4'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -top-1 -left-1 size-10 cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={value}
        onChange={(e) => handleHexInput(e.target.value)}
        placeholder="#5FD3C4"
        maxLength={7}
        invalid={value.length > 0 && !HEX_RE.test(value)}
        className="h-9 max-w-[7.5rem] font-mono text-[13px]"
      />
    </div>
  )
}
