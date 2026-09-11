import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'

interface CategorySwatchesProps {
  value: string
  onChange: (hex: string) => void
  /** Color de fondo contra el que se dibuja el anillo interior. Por defecto la superficie de la
   *  tarjeta; en una fila-editor abierta hay que pasarle `var(--color-editing)`, o el anillo se
   *  recorta contra el fondo equivocado. */
  ringBase?: string
  className?: string
}

/**
 * Los ocho colores de `CATEGORY_COLORS` como botones de 22px, en una sola línea. Reemplaza al
 * `ColorPicker` de color libre en las dos listas de categorías (la de cada cuenta y la del admin):
 * ahí lo que se elige es "cuál de los ocho", no un hex cualquiera, y con la fila abierta al lado de
 * sus vecinas se ve el color nuevo contra los que ya están.
 *
 * El elegido lleva anillo doble — el interior del color del fondo, el exterior del propio color —
 * para que se lea igual sobre cualquier superficie. Va como `box-shadow` y no como `ring-*` de
 * Tailwind porque son dos anillos de colores distintos, y `ring` sólo da uno.
 */
export function CategorySwatches({
  value,
  onChange,
  ringBase = 'var(--color-surface)',
  className,
}: CategorySwatchesProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Color">
      {CATEGORY_COLORS.map((c) => {
        const selected = c.hex.toLowerCase() === value.toLowerCase()
        return (
          <button
            key={c.hex}
            type="button"
            onClick={() => onChange(c.hex)}
            aria-label={c.name}
            aria-pressed={selected}
            className="size-[22px] rounded-full transition-shadow duration-150"
            style={{
              backgroundColor: c.hex,
              boxShadow: selected ? `0 0 0 2px ${ringBase}, 0 0 0 3.5px ${c.hex}` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
