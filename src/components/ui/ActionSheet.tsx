import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import { cn } from '@/lib/cn'

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  /** Encabezado de la hoja: qué se está por accionar ("• ICBC  $ 405.564,77"). */
  header?: ReactNode
  /** Nombre accesible de la hoja — el encabezado visible suele ser un dato, no un título. */
  label: string
  children: ReactNode
}

/**
 * Hoja inferior de acciones — el menú `⋯` en el celular, donde un popover al lado del dedo queda
 * tapado o cortado. Sobre `<dialog>` nativo: foco atrapado y `::backdrop` gratis.
 *
 * No se reusa `Dialog`: ese exige un título con ✕ y NO cierra con Escape ni con un click afuera, a
 * propósito, para no perder una carga en curso. Una hoja de acciones no carga nada: tiene que
 * cerrarse con cualquier gesto que la descarte.
 */
export function ActionSheet({ open, onClose, header, label, children }: ActionSheetProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  // Escape dispara `cancel` antes de cerrar; el cierre real lo hace el padre al bajar `open`.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onClose()
  }

  // Un click sobre el backdrop llega al <dialog> mismo (target === currentTarget); uno adentro, a
  // un hijo. La hoja no tiene padding externo, así que no hay "click en el borde" que confundir.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  // Mismo refuerzo de foco que `Dialog`: el trap nativo a veces deja escapar el Tab.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const focusable = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={handleCancel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        // Anclada abajo y a todo el ancho, sin margen: es una hoja, no una tarjeta flotante.
        'fixed inset-x-0 top-auto bottom-0 z-50 m-0 w-full max-w-none overflow-hidden bg-transparent p-0 text-fg',
        'overscroll-contain animate-sheet-in backdrop:bg-black/75',
      )}
    >
      <div className="rounded-t-sheet border-t border-divider-list bg-surface px-3.5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto mb-3.5 h-1 w-[42px] rounded-pill bg-border-strong" />
        {header && <div className="px-1.5 pb-3">{header}</div>}
        {children}
      </div>
    </dialog>
  )
}

/** Un renglón de la hoja: a todo el ancho, con la línea divisoria arriba y 44px de alto mínimo. */
export function ActionSheetItem({
  onClick,
  children,
  tone = 'default',
  emphasis = false,
}: {
  onClick: () => void
  children: ReactNode
  tone?: 'default' | 'quiet' | 'destructive'
  /** La acción principal de la hoja (Reajustar saldo) va en semibold. */
  emphasis?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block min-h-11 w-full border-t border-divider-list px-2.5 py-[13px] text-left text-[14px] transition-colors duration-150 hover:bg-surface-sunken',
        emphasis ? 'font-semibold' : 'font-medium',
        tone === 'default' && 'text-fg',
        tone === 'quiet' && 'text-fg-secondary',
        tone === 'destructive' && 'text-negative',
      )}
    >
      {children}
    </button>
  )
}

/** El cierre explícito de la hoja. */
export function ActionSheetCancel({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 min-h-11 w-full rounded-float bg-fill-subtle px-3 py-3 text-[13.5px] font-semibold text-fg transition-colors duration-150 hover:bg-border-strong"
    >
      Cancelar
    </button>
  )
}
