import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CollapsibleCellProps {
  label: string
  /** La aclaración al lado del rótulo: "no suman al total". */
  note?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/**
 * Una celda que arranca plegada: un botón punteado con el rótulo (Archivadas, Últimas
 * transferencias) y, abierta, una tarjeta con su lista. Vive en su propia grilla, debajo de la de las
 * cuentas: lo secundario no se mezcla con ellas, pero sigue a un toque.
 *
 * Abierta ocupa las dos columnas de esa grilla, que es `dense` para que no deje un hueco atrás.
 */
export function CollapsibleCell({ label, note, open, onToggle, children }: CollapsibleCellProps) {
  const heading = (
    <>
      <ChevronRight
        className={cn('size-3 shrink-0 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
        strokeWidth={1.8}
        aria-hidden
      />
      <span className="eyebrow">{label}</span>
      {note && <span className="text-[11.5px] text-fg-muted">{note}</span>}
    </>
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        className="flex min-h-14 min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded-panel-sm border border-dashed border-border-strong bg-transparent px-[18px] py-4 text-left transition-colors duration-150 hover:bg-fill-subtle sm:rounded-panel sm:px-6 sm:py-[22px]"
      >
        {heading}
      </button>
    )
  }

  return (
    <div className="min-w-0 rounded-panel-sm bg-surface px-[18px] py-4 sm:col-span-2 sm:rounded-panel sm:px-6 sm:py-[22px]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        className="flex w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 text-left"
      >
        {heading}
      </button>
      {children}
    </div>
  )
}
