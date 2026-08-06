import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/**
 * Sobre `<dialog>` nativo: trae gratis el foco atrapado, el Escape y el `::backdrop`.
 * En mobile entra como bottom sheet — un modal centrado en un celular siempre queda peor.
 */
export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  // Un <dialog> abierto con showModal() vive en el "top layer" del navegador, siempre por
  // encima de cualquier overlay position:fixed normal sin importar su z-index. Por eso el
  // indicador de "guardando" tiene que vivir adentro del propio dialog, no como capa aparte.
  const isMutating = useIsMutating()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  // Clic en el backdrop: el target es el propio <dialog>, no su contenido.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === ref.current) onClose()
  }

  // El focus-trap de <dialog> nativo no es del todo confiable (Tab desde el último elemento a
  // veces se escapa al resto del documento en vez de volver al principio) — se refuerza a mano.
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
      aria-labelledby="dialog-title"
      className={cn(
        'mx-0 mt-auto mb-0 w-full max-w-none overflow-hidden rounded-t-panel bg-ink-900 p-0 text-chalk',
        'animate-sheet-in backdrop:bg-ink-950/75',
        'sm:m-auto sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-panel',
        className,
      )}
    >
      <div className="relative">
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-2">
          <h2 id="dialog-title" className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1.5 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
          >
            <svg viewBox="0 0 14 14" className="size-4" aria-hidden>
              <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}

        {isMutating > 0 && (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="absolute inset-0 grid place-items-center bg-ink-900/70 backdrop-blur-[1px]"
          >
            <Spinner className="text-acid" />
          </div>
        )}
      </div>
    </dialog>
  )
}
