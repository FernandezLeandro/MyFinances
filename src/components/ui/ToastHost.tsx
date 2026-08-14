import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { dismissToast, getToasts, subscribeToasts, type Toast } from '@/lib/toast'

function ToastItem({ toast }: { toast: Toast }) {
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-sheet-in pointer-events-auto flex items-start gap-3 rounded-panel bg-ink-900 px-4 py-3 shadow-lift ring-1',
        toast.tone === 'error' ? 'ring-coral/30' : 'ring-acid/30',
      )}
    >
      <p className="flex-1 text-[13px] text-chalk">{toast.message}</p>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Cerrar aviso"
        className="-mr-1 shrink-0 rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
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
        'inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[min(22rem,calc(100vw-2.5rem))]',
      )}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    target,
  )
}
