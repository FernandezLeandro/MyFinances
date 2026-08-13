import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

/**
 * Sobre `<dialog>` nativo, igual que `Dialog`: foco atrapado y `::backdrop` gratis, y un modal en el
 * top layer del navegador le gana a cualquier overlay `position:fixed` sin pelear con z-index. A
 * diferencia de `Dialog` (que bloquea Escape y el click afuera a propósito, para no perder una carga
 * en curso), acá sí cierran ambos — es un menú de navegación, no un formulario. Entra desde la
 * izquierda en vez del bottom-sheet de `Dialog`.
 */
export function Drawer({ open, onClose, children, className }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  function handleClick(event: React.MouseEvent<HTMLDialogElement>) {
    // Click en el propio <dialog> (fuera del panel interno) es el equivalente del backdrop.
    if (event.target === ref.current) onClose()
  }

  // El focus-trap nativo de <dialog> no siempre atrapa Tab de forma confiable — se refuerza a mano,
  // igual que en `Dialog`.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const dialog = ref.current
    if (!dialog) return

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return

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
      onClose={onClose}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'm-0 h-dvh max-h-none w-[min(20rem,82vw)] max-w-none bg-transparent p-0 backdrop:bg-ink-950/75',
      )}
    >
      <div
        className={cn(
          'flex h-full w-full animate-drawer-in flex-col overflow-y-auto bg-ink-900 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {children}
      </div>
    </dialog>
  )
}
