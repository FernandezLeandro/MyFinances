import { useEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/cn'

interface MenuProps {
  open: boolean
  onClose: () => void
  /** Ref del botón que abre el menú — se excluye del cierre por click-afuera y recupera el foco al cerrar. */
  triggerRef: RefObject<HTMLElement | null>
  /** Clases de posicionamiento (el padre sabe si ancla hacia arriba o hacia la derecha). */
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

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-30 animate-menu-in overflow-hidden rounded-control bg-ink-850 py-1.5 shadow-lift ring-1 ring-ink-700',
        anchorClassName,
      )}
    >
      {children}
    </div>
  )
}

interface MenuItemProps {
  onClick: () => void
  children: ReactNode
  tone?: 'default' | 'danger'
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
        'flex w-full items-center gap-2.5 text-left transition-colors duration-150',
        size === 'md' ? 'px-3.5 py-2.5 text-[15px]' : 'px-3.5 py-2 text-[13px]',
        tone === 'danger' ? 'text-chalk-dim hover:bg-ink-800 hover:text-coral' : 'text-chalk-dim hover:bg-ink-800 hover:text-chalk',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
