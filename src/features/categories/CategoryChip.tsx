import { categoryIcon, NEUTRAL_CHIP_ICONS } from '@/lib/categoryIcons'
import { onColor } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'
import type { ChipLook } from './chip'

type CategoryChipProps = ChipLook & {
  /** Lado en px y su rol: 16 dentro de una píldora (filtros de Movimientos, resumen de Ajustes), 20
   *  en línea con el nombre (tabla de Movimientos, leyendas de Análisis y Hoy, Pagados/Pausados de
   *  Fijos), 28 como avatar de fila (`TransactionRow`, `TransferRow`, `FixedExpenseRow`). 36/38/48
   *  son los tamaños de siempre: la lista de `/categorias`, su tarjeta de borrar y su editor. */
  size?: 16 | 20 | 28 | 36 | 38 | 40 | 48
  /** Archivada: gris, con SU ícono — se ve que no se ofrece al cargar, pero se sigue reconociendo
   *  cuál es (un fijo pausado, una categoría archivada en `/categorias`). Sin efecto si la ficha ya
   *  es `neutral`: esas son grises de por sí y llevan su propio ícono fijo. */
  archived?: boolean
  className?: string
}

const boxClass: Record<NonNullable<CategoryChipProps['size']>, string> = {
  16: 'size-4 rounded-[5px]',
  20: 'size-5 rounded-[6px]',
  28: 'size-7 rounded-[8px]',
  36: 'size-9 rounded-[11px]',
  38: 'size-[38px] rounded-[11px]',
  40: 'size-10 rounded-[12px]',
  48: 'size-12 rounded-[14px]',
}

const iconClass: Record<NonNullable<CategoryChipProps['size']>, string> = {
  16: 'size-2.5',
  20: 'size-3',
  28: 'size-4',
  36: 'size-[18px]',
  38: 'size-[18px]',
  40: 'size-5',
  48: 'size-5',
}

const strokeWidth: Record<NonNullable<CategoryChipProps['size']>, number> = {
  16: 2.5,
  20: 2.25,
  28: 2,
  36: 2,
  38: 2,
  40: 2,
  48: 2,
}

/**
 * Ficha de categoría: sólida, del color guardado, con el ícono en blanco o en tinta según cuál
 * contraste más (`onColor`). El filete de 1px (`ring-fg/10`) es para que Negro o Niebla no se
 * pierdan contra la superficie en el tema que les toca. El tinte suave de antes dejaba de leerse
 * con pasteles y neutros — por eso es sólida.
 *
 * También pinta las cuatro fichas neutras grises de `ChipLook` (ver `chip.ts` y
 * `NEUTRAL_CHIP_ICONS`): sin categoría, ajuste de saldo, transferencia, y el agregado "Ver N
 * más"/"Otros N" de Análisis. Usan el mismo gris que `archived` (`bg-fill-subtle`/`text-fg-muted`).
 *
 * `size` decide además el ícono y su trazo — más chico, más fino, así no se ve borroso a 16px.
 */
export function CategoryChip({ size = 36, archived = false, className, ...look }: CategoryChipProps) {
  const Icon = 'neutral' in look ? NEUTRAL_CHIP_ICONS[look.neutral] : categoryIcon(look.icon).Icon
  const colorStyle = 'neutral' in look ? undefined : { backgroundColor: look.color, color: onColor(look.color) }
  const gray = 'neutral' in look || archived
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center ring-1 ring-fg/10 ring-inset',
        boxClass[size],
        gray && 'bg-fill-subtle text-fg-muted',
        className,
      )}
      style={gray ? undefined : colorStyle}
    >
      <Icon className={iconClass[size]} strokeWidth={strokeWidth[size]} />
    </span>
  )
}
