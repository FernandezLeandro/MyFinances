import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Fila con check redondo de las listas de selección múltiple — categorías y cuentas en Filtros de
 *  Movimientos, categorías en Inversiones. Va dentro de un `<ul>`. */
export function CheckRow({ leading, name, checked, onToggle }: { leading: ReactNode; name: string; checked: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          'flex h-[50px] w-full items-center gap-3 px-1 text-left text-[14.5px] text-fg',
          checked ? 'font-semibold' : 'font-medium',
        )}
      >
        {leading}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span
          aria-hidden
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-full',
            checked ? 'bg-fg text-surface' : 'border-[1.5px] border-border-strong',
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3.5} />}
        </span>
      </button>
    </li>
  )
}
