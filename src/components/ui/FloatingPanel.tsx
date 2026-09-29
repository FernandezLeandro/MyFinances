import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useDialogPortalRoot } from '@/components/ui/dialog-portal'

/** Cierra con un click afuera (sin contar el trigger) o con Escape, y devuelve el foco al trigger. */
function useDismiss(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      onClose()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, panelRef, triggerRef])
}

/**
 * Popover propio para abrir DENTRO de un diálogo (buscador de categoría, desplegable de cuenta). No
 * usa `Menu` (el popover genérico de la app): ese vive dentro del flujo normal del DOM, y acá el
 * `overflow-y-auto` del cuerpo del diálogo lo recortaba apenas se abría cerca del final (Bloque 3 del
 * rediseño de modales, visto en vivo en mobile). Se porta al nodo de `useDialogPortalRoot` — hermano
 * del cuerpo, sin overflow propio, todavía adentro del `<dialog>` (así no pierde el "top layer"
 * nativo) — y se posiciona a mano contra el trigger. Fuera de un `Dialog` no se muestra.
 */
export function FloatingPanel({
  open,
  onClose,
  triggerRef,
  anchorRef,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Botón que abre/cierra: recibe el foco al cerrar y un click adentro no cuenta como "afuera". */
  triggerRef: RefObject<HTMLElement | null>
  /** Contra qué elemento se posiciona y mide el ancho, si no es el trigger — ej. la grilla entera de
   *  categorías, no el botón «Buscar entre todas», que es más angosto. */
  anchorRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const root = useDialogPortalRoot()
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)

  // Una sola medición al abrir, como `Menu`: un popover abierto es momentáneo, no hace falta
  // re-medir en scroll/resize.
  useLayoutEffect(() => {
    if (!open || !root) return
    const anchor = anchorRef?.current ?? triggerRef.current
    if (!anchor) return
    const anchorBox = anchor.getBoundingClientRect()
    const rootBox = root.getBoundingClientRect()
    const width = Math.min(anchorBox.width, rootBox.width - 16)
    const left = Math.max(8, Math.min(anchorBox.left - rootBox.left, rootBox.width - width - 8))
    // Abre hacia abajo; si abajo queda poco lugar (un campo al final del formulario, como Cuenta) y
    // arriba hay más, se da vuelta y abre hacia arriba — si no, la lista quedaba de 1 fila, tapando el pie.
    const below = rootBox.bottom - anchorBox.bottom - 16
    const above = anchorBox.top - rootBox.top - 16
    if (below < 240 && above > below) {
      const bottom = rootBox.bottom - anchorBox.top + 8
      setStyle({ top: undefined, bottom, left, width, maxHeight: above })
    } else {
      const top = anchorBox.bottom - rootBox.top + 8
      setStyle({ top, bottom: undefined, left, width, maxHeight: rootBox.height - top - 8 })
    }
  }, [open, root, triggerRef, anchorRef])

  useDismiss(open, onClose, panelRef, triggerRef)

  if (!open || !root || !style) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'absolute', top: style.top, bottom: style.bottom, left: style.left, width: style.width, maxHeight: style.maxHeight }}
      className="pointer-events-auto z-10 flex animate-menu-in flex-col overflow-hidden rounded-float border border-border bg-surface shadow-lift"
    >
      {children}
    </div>,
    root,
  )
}

/**
 * Hoja que sube desde abajo DENTRO del diálogo, con un velo sobre el resto — la versión mobile del
 * desplegable de cuenta (rediseño de modales v2). Mismo nodo de portal y mismo cierre que
 * `FloatingPanel`; no es un `<dialog>` aparte: uno encima de otro pelea por el foco y el top layer.
 */
export function InDialogSheet({
  open,
  onClose,
  triggerRef,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  title: string
  children: ReactNode
}) {
  const root = useDialogPortalRoot()
  const panelRef = useRef<HTMLDivElement>(null)
  useDismiss(open, onClose, panelRef, triggerRef)

  if (!open || !root) return null

  return createPortal(
    <>
      <div aria-hidden className="pointer-events-auto absolute inset-0 z-10 bg-black/30" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[80%] animate-sheet-in flex-col gap-1 rounded-panel bg-surface px-3 pt-2.5 pb-[max(1.125rem,env(safe-area-inset-bottom))] shadow-lift"
      >
        <span aria-hidden className="mb-1.5 h-1 w-9 shrink-0 self-center rounded-full bg-border-strong" />
        <p className="px-2 pt-0.5 pb-2 font-display text-[16px] font-semibold">{title}</p>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </>,
    root,
  )
}
