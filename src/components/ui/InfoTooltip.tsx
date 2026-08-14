import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/cn'

interface InfoTooltipProps {
  text: string
  className?: string
}

/**
 * Ícono de ayuda que revela una aclaración corta al tocarlo — no al pasar el mouse: en mobile no
 * hay hover, y así el mismo gesto (tap) funciona igual en los dos casos. Se cierra solo al perder
 * el foco (tab, click afuera), sin necesitar un listener global de click.
 */
export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-label="Más información"
        className="grid place-items-center text-chalk-faint transition-colors duration-150 hover:text-chalk-dim"
      >
        {/* strokeWidth 1.5: matea el rango 1.3-1.8 que ya usan los íconos a mano del resto de la
            app (ver EyeToggle, Dialog, etc.) en vez del 2 que trae la librería por default. */}
        <CircleHelp size={14} strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <span className="absolute top-full left-0 z-10 mt-1.5 w-56 rounded-control border border-ink-700 bg-ink-800 p-2.5 text-[12px] leading-snug text-chalk-dim shadow-lg">
          {text}
        </span>
      )}
    </span>
  )
}
