import { cn } from '@/lib/cn'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md'
  className?: string
}

const sizeClasses = {
  sm: 'size-8 text-[12px]',
  md: 'size-10 text-[13px]',
}

/**
 * Círculo de iniciales. Deliberadamente en `ink-800`, no en ácido: ese acento se reserva para el
 * dato principal y la serie primaria de un gráfico (ver `theme.css`), y un avatar visible en cada
 * pantalla lo rompería. Se eleva por luminosidad como el resto de las superficies.
 */
export function Avatar({ initials, size = 'sm', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-ink-800 font-display font-semibold text-chalk-dim ring-1 ring-ink-700',
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </span>
  )
}
