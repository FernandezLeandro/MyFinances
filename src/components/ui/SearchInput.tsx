import { Search } from 'lucide-react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

// Clases propias, no `controlBase` de `Input.tsx`: ese ya trae `px-3.5` (shorthand), y sumarle un
// `pl-9` encima para el ícono compite por la misma propiedad sin que `cn` (sin tailwind-merge)
// pueda garantizar quién gana. Repetir el resto de `controlBase` acá es más barato que ese riesgo.
const searchClasses =
  'w-full rounded-control bg-ink-850 pr-3.5 pl-9 text-chalk placeholder:text-chalk-faint ' +
  'transition-colors duration-150 outline-none hover:bg-ink-800 focus:bg-ink-800 disabled:opacity-40'

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Campo de búsqueda con lupa — Movimientos hoy, cualquier lista filtrable a futuro. */
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-chalk-faint"
        strokeWidth={1.6}
        aria-hidden
      />
      <input type="search" className={cn(searchClasses, 'h-9 text-[13px]', className)} {...props} />
    </div>
  )
}
