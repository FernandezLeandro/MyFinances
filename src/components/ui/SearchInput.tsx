import { Search, X } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Clases propias, no `controlBase` de `Input.tsx`: ese ya trae `px-3.5` (shorthand), y sumarle un
// `pl-9` encima para el ícono compite por la misma propiedad sin que `cn` (sin tailwind-merge)
// pueda garantizar quién gana. Repetir el resto de `controlBase` acá es más barato que ese riesgo.
// La ✕ nativa de `type="search"` se oculta: cambia de navegador en navegador y no respeta el tema —
// la reemplaza la de `onClear`.
const searchBase =
  'w-full text-fg placeholder:text-fg-muted outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ' +
  'disabled:opacity-40 [&::-webkit-search-cancel-button]:appearance-none'

// `md`: el buscador relleno de los diálogos (rediseño de modales v2). `lg`: el de pantalla
// (Movimientos, `/categorias`) — superficie con borde, y el foco con el mismo anillo de acento que
// un `FieldButton` abierto.
const sizeClasses = {
  md: 'h-9 rounded-control bg-fill-subtle pl-9 text-[13px]',
  lg: 'h-11 rounded-control border border-border-strong bg-surface pl-10 text-[14.5px] font-medium focus:border-accent focus:ring-4 focus:ring-accent-soft',
}

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  /** `lg` (44px) cuando va al lado de controles de 44 — el segmentado de `/categorias` y Movimientos. */
  size?: 'md' | 'lg'
  /** Con texto, muestra una ✕ para borrar la búsqueda. Sin esto no hay ✕ (Escape igual la borra). */
  onClear?: () => void
}

/** Campo de búsqueda con lupa — Movimientos, `/categorias` y los buscadores de los diálogos. */
export function SearchInput({ className, size = 'md', onClear, value, ...props }: SearchInputProps) {
  const lg = size === 'lg'
  const showClear = onClear && value !== undefined && value !== ''
  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-muted',
          lg ? 'left-3.5 size-[18px]' : 'left-3 size-3.5',
        )}
        strokeWidth={lg ? 1.9 : 1.6}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        className={cn(searchBase, sizeClasses[size], showClear ? 'pr-11' : 'pr-3.5')}
        {...props}
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Borrar búsqueda"
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-item text-fg-secondary hover:text-fg"
        >
          <span className="grid size-5 place-items-center rounded-full bg-fill-subtle">
            <X className="size-3" strokeWidth={3} aria-hidden />
          </span>
        </button>
      )}
    </div>
  )
}
