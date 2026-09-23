import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { dismissToast, getToasts, subscribeToasts, type Toast } from '@/lib/toast'

/** Superficie invertida (la misma de la tarjeta "Proyectado"): el aviso se despega de la pantalla
 *  sin ring ni borde. El punto de color dice el tono; el botón, si hay, es lo único accionable. */
function ToastItem({ toast }: { toast: Toast }) {
  const isError = toast.tone === 'error'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className="animate-sheet-in pointer-events-auto flex items-center gap-4 rounded-float bg-inverse px-[18px] py-3.5 text-on-inverse shadow-lift"
    >
      <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', isError ? 'bg-negative-on-inverse' : 'bg-accent')} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug font-semibold">{toast.message}</p>
        {toast.detail && <p className="mt-[3px] text-[12px] leading-snug text-on-inverse-secondary">{toast.detail}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            dismissToast(toast.id)
            toast.action?.onClick()
          }}
          className="shrink-0 rounded-item bg-on-inverse px-3 py-[7px] text-[12px] font-semibold text-inverse transition-opacity duration-150 hover:opacity-90"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Cerrar aviso"
        className="-mr-1.5 shrink-0 rounded-chip p-1 text-on-inverse-muted transition-colors hover:text-on-inverse"
      >
        <X className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts)
  const [target, setTarget] = useState<Element>(() => document.body)

  useEffect(() => {
    // Un <dialog> abierto con showModal() (ver Dialog.tsx) vive en el top layer del navegador, y su
    // ::backdrop pinta por encima de cualquier `position: fixed` normal — comprobado que ni
    // siquiera un popover="manual" alcanza a superarlo, porque un dialog MODAL gana esa pulseada
    // (así lo confirma un repro mínimo fuera de esta app, no es un problema de este CSS puntual).
    // La salida es no competir por el top layer: si hay un dialog abierto, se portea el toast como
    // HIJO REAL de ese dialog — al ser descendiente, pinta por encima de su propio backdrop por
    // simple anidamiento del DOM, sin depender de ninguna API del navegador.
    const dialog = document.querySelector('dialog[open]')
    setTarget(dialog ?? document.body)
    if (!dialog) return

    // Si el dialog se cierra mientras el toast sigue en pantalla, hay que sacarlo de ahí ANTES de
    // que quede huérfano — pero acá el botón "Cerrar" y el click en el backdrop (ver Dialog.tsx)
    // desmontan el dialog directo desde React sin pasar por `dialog.close()`, así que el evento
    // nativo "close" nunca dispara. Un MutationObserver detecta la desconexión real del nodo sin
    // importar por qué vía se cerró.
    const observer = new MutationObserver(() => {
      if (!dialog.isConnected) {
        setTarget(document.body)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [toasts.length])

  return createPortal(
    <div
      role="region"
      aria-label="Avisos"
      className={cn(
        'pointer-events-none fixed z-50 flex flex-col gap-2',
        'inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[min(26rem,calc(100vw-2.5rem))]',
      )}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    target,
  )
}
