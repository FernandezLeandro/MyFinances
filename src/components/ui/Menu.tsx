import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/cn'

interface MenuProps {
  open: boolean
  onClose: () => void
  /** Ref del botón que abre el menú — se excluye del cierre por click-afuera y recupera el foco al cerrar. */
  triggerRef: RefObject<HTMLElement | null>
  /** Clases de posicionamiento (el padre sabe si ancla hacia arriba o hacia la derecha). Si abre
   *  hacia abajo (`top-full`) y no entra en el viewport, el menú se da vuelta solo. */
  anchorClassName: string
  children: ReactNode
}

/**
 * Popover liviano para el menú de cuenta. A diferencia de `Dialog` (que bloquea Escape y el click
 * afuera a propósito, para no perder una carga en curso), un menú tiene que cerrarse con ambos —
 * por eso no se reusa esa base y se arma este primitivo aparte.
 *
 * Deliberadamente no usa `role="menu"`/`"menuitem"`: ese patrón ARIA exige navegación por flechas
 * que acá no está implementada, y un menú "menu" sin ella es peor que no ponerlo — botones simples
 * dentro de un popover (Tab, Enter, Escape) ya son navegables y no prometen un comportamiento que no
 * dan.
 */
export function Menu({ open, onClose, triggerRef, anchorClassName, children }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (ref.current?.contains(target)) return
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
  }, [open, onClose, triggerRef])

  // Una sola pasada, al abrir: si el menú se sale por abajo y hay lugar arriba del botón, se ancla
  // arriba. No se re-mide después (scroll, resize) — un menú abierto es momentáneo. Es una
  // escritura directa al estilo y no un `setState`: evita el render extra y el parpadeo entre los
  // dos, y al cerrarse el nodo se desmonta y la próxima apertura vuelve a medir de cero.
  useLayoutEffect(() => {
    const menu = ref.current
    const trigger = triggerRef.current
    if (!open || !menu || !trigger || !anchorClassName.includes('top-full')) return

    const menuRect = menu.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    const overflowsBelow = menuRect.bottom > window.innerHeight - VIEWPORT_MARGIN
    const fitsAbove = triggerRect.top - menuRect.height - VIEWPORT_MARGIN >= 0
    if (overflowsBelow && fitsAbove) {
      menu.style.top = 'auto'
      menu.style.bottom = '100%'
      menu.style.marginTop = '0'
      menu.style.marginBottom = '4px'
    }
  }, [open, triggerRef, anchorClassName])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-30 animate-menu-in rounded-float border border-border bg-surface p-1.5 shadow-lift',
        anchorClassName,
      )}
    >
      {children}
    </div>
  )
}

/** Aire mínimo entre el menú y el borde del viewport para dar por bueno que "entra". */
const VIEWPORT_MARGIN = 8

/** La línea que separa lo de todos los días de lo que cierra o destruye. */
export function MenuDivider() {
  return <div role="separator" className="mx-2 my-[5px] h-px bg-divider-list" />
}

interface MenuItemProps {
  onClick: () => void
  children: ReactNode
  /** `quiet` baja un escalón el peso de una opción secundaria (Archivar). `danger` sólo se pone rojo
   *  al pasar el mouse (cerrar sesión); `destructive` es rojo siempre (Eliminar) porque lo que hace
   *  no se deshace. */
  tone?: 'default' | 'quiet' | 'danger' | 'destructive'
  icon?: ReactNode
  /** `md` para el drawer de mobile (más texto, más tap target); `sm` es el default para el popover
   *  de desktop, donde un menú chico al lado del mouse tiene más sentido. */
  size?: 'sm' | 'md'
}

export function MenuItem({ onClick, children, tone = 'default', icon, size = 'sm' }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-item text-left transition-colors duration-150',
        size === 'md' ? 'px-3.5 py-2.5 text-[15px]' : 'px-3 py-[9px] text-[13px] font-medium',
        tone === 'default' && 'text-fg hover:bg-surface-sunken',
        tone === 'quiet' && 'text-fg-secondary hover:bg-surface-sunken hover:text-fg',
        tone === 'danger' && 'text-fg-secondary hover:bg-surface-sunken hover:text-negative',
        tone === 'destructive' && 'text-negative hover:bg-badge-red-bg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
