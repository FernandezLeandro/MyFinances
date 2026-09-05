import { cn } from '@/lib/cn'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md'
  /** `circle` (default) para el sidebar/drawer de la nav vieja; `square` para el avatar de
   *  `TopBar` — el sistema nuevo lo dibuja con esquinas redondeadas, no un círculo. */
  shape?: 'circle' | 'square'
  className?: string
}

const sizeClasses = {
  sm: 'size-8 text-[12px]',
  md: 'size-10 text-[13px]',
}

const shapeClasses = {
  circle: 'rounded-full',
  square: 'rounded-[10px]',
}

/**
 * Círculo (o cuadrado redondeado) de iniciales. Deliberadamente en `ink-800`, no en el acento: ese
 * color se reserva para el dato principal y la serie primaria de un gráfico (ver `theme.css`), y un
 * avatar visible en cada pantalla lo rompería. Se eleva por luminosidad como el resto de las
 * superficies.
 */
export function Avatar({ initials, size = 'sm', shape = 'circle', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center bg-ink-800 font-display font-semibold text-chalk-dim ring-1 ring-ink-700',
        sizeClasses[size],
        shapeClasses[shape],
        className,
      )}
    >
      {initials}
    </span>
  )
}
