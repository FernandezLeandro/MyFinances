import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react'
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

// showModal() no bloquea por sí solo el scroll del <body> en mobile — el contenido de atrás
// sigue siendo "arrastrable" salvo que se lo bloqueemos a mano. Contador global en vez de un
// simple booleano: si algún día hay dos <dialog> abiertos a la vez, el que se cierra primero no
// debe destrabar el fondo mientras el otro lo sigue necesitando.
let lockCount = 0
function lockBodyScroll() {
  if (lockCount++ === 0) document.body.style.overflow = 'hidden'
}
function unlockBodyScroll() {
  if (--lockCount <= 0) {
    lockCount = 0
    document.body.style.overflow = ''
  }
}

/**
 * Sobre `<dialog>` nativo: trae gratis el foco atrapado y el `::backdrop`.
 * En mobile entra como bottom sheet — un modal centrado en un celular siempre queda peor.
 * Cierra sólo por la X o los botones del footer — ni Escape ni un click afuera lo cierran (ver
 * `handleCancel`), a propósito: perder una carga en curso por un click sin querer es peor que la
 * comodidad de cerrar rápido.
 *
 * Altura acotada + sólo el cuerpo scrollea (header y footer quedan fijos): sin esto, un contenido
 * más alto que la pantalla quedaba cortado por el `overflow-hidden` de más abajo, y al no haber
 * ninguna zona scrolleable adentro del diálogo, deslizar el dedo sobre el popup terminaba
 * scrolleando la página de atrás en vez del contenido — el bug reportado en Cuadrar saldo y en
 * los formularios largos.
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
    if (open && !el.open) {
      // `showModal` no existe antes de iOS 15.4 — sin este fallback la llamada tira TypeError y el
      // diálogo no abre nunca. Con `open` a mano no hay top layer ni focus-trap nativo, pero el
      // `position: fixed` + `z-50` de arriba y el focus-trap propio de `handleKeyDown` ya cubren
      // ambas cosas.
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
      lockBodyScroll()
    } else if (!open && el.open) {
      el.close()
      unlockBodyScroll()
    }
  }, [open])

  // Si el componente se desmonta con el diálogo todavía abierto (navegación en medio de una
  // carga), el `useEffect` de arriba no llega a correr con `open: false` — sin este cleanup el
  // contador quedaría trabado y el scroll del body no volvería nunca.
  useEffect(() => {
    const el = ref.current
    return () => {
      if (el?.open) unlockBodyScroll()
    }
  }, [])

  // "cancel" es el evento que dispara Escape antes de cerrar — bloquearlo con preventDefault no
  // toca "close" (que sigue disparando onClose para el cierre programático de la X/footer).
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
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
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      aria-labelledby="dialog-title"
      className={cn(
        // Posicionamiento EXPLÍCITO, sin depender de los defaults que cada navegador le da a un
        // `dialog:modal`. La versión anterior centraba/anclaba con `margin:auto`, que sólo funciona
        // si el navegador además fija `inset: 0` en su hoja de estilos; Safari de iOS no lo resuelve
        // igual que Chrome de escritorio, y el diálogo terminaba fuera de la pantalla — abierto y
        // bloqueando la página (el backdrop sí se pinta), pero invisible. Como la rama mobile es la
        // única que usaba `mt-auto`, en escritorio nunca se notó.
        //
        // Ojo también con las clases de `display` (flex/grid) acá: pisan la regla
        // `dialog:not([open]) { display: none }` del navegador. El layout de columna va en el
        // wrapper de adentro. `vh` y no `dvh`: las unidades dinámicas se resuelven de forma
        // inconsistente dentro del top layer en mobile.
        'fixed inset-x-0 top-auto bottom-0 z-50 m-0 w-full max-w-none overflow-hidden rounded-t-panel bg-ink-900 p-0 text-chalk',
        'overscroll-contain animate-sheet-in backdrop:bg-ink-950/75',
        'sm:inset-0 sm:m-auto sm:h-fit sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-panel',
        className,
      )}
    >
      <div className="relative flex max-h-[85vh] flex-col sm:max-h-[80vh]">
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-6 pb-2">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 justify-end gap-2 px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
