import { categoryIcon } from '@/lib/categoryIcons'
import { onColor } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'

interface CategoryChipProps {
  color: string
  icon: string | null | undefined
  /** Lado en px: 36 en la lista, 38 en la tarjeta de borrar, 48 junto al nombre en el editor. */
  size?: 36 | 38 | 40 | 48
  /** Archivada: gris, sin el color — se ve que no se ofrece al cargar. */
  archived?: boolean
  className?: string
}

const boxClass: Record<NonNullable<CategoryChipProps['size']>, string> = {
  36: 'size-9 rounded-[11px]',
  38: 'size-[38px] rounded-[11px]',
  40: 'size-10 rounded-[12px]',
  48: 'size-12 rounded-[14px]',
}

/**
 * Ficha de categoría: sólida, del color guardado, con el ícono en blanco o en tinta según cuál
 * contraste más (`onColor`). El filete de 1px (`ring-fg/10`) es para que Negro o Niebla no se
 * pierdan contra la superficie en el tema que les toca. El tinte suave de antes dejaba de leerse
 * con pasteles y neutros — por eso es sólida.
 */
export function CategoryChip({ color, icon, size = 36, archived = false, className }: CategoryChipProps) {
  const { Icon } = categoryIcon(icon)
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center ring-1 ring-fg/10 ring-inset',
        boxClass[size],
        archived && 'bg-fill-subtle text-fg-muted',
        className,
      )}
      style={archived ? undefined : { backgroundColor: color, color: onColor(color) }}
    >
      <Icon className={size >= 40 ? 'size-5' : 'size-[18px]'} strokeWidth={2} />
    </span>
  )
}
