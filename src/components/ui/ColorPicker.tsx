import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  className?: string
}

/** Los 8 swatches de `CATEGORY_COLORS` — el elegido lleva un anillo doble (hueco de `surface` +
 *  el propio color) en vez de un borde simple, para que se note incluso al lado de un swatch de
 *  color parecido. Reemplaza el picker libre de antes: una categoría nueva ya no elige un hex a
 *  mano, elige uno de estos ocho. */
export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {CATEGORY_COLORS.map((c) => {
        const selected = value.toLowerCase() === c.hex.toLowerCase()
        return (
          <button
            key={c.hex}
            type="button"
            onClick={() => onChange(c.hex)}
            aria-label={c.name}
            aria-pressed={selected}
            className="size-[22px] shrink-0 rounded-full transition-shadow duration-150"
            style={{
              backgroundColor: c.hex,
              boxShadow: selected ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${c.hex}` : 'none',
            }}
          />
        )
      })}
    </div>
  )
}
