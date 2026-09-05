import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import type { NavItem } from '@/app/nav'

interface MobileTabBarProps {
  items: NavItem[]
  drawerOpen: boolean
  onOpenDrawer: () => void
  /** Sólo `AppLayout` lo pasa: abre el form de nuevo movimiento desde un FAB central, partiendo
   *  `items` en dos mitades (ver Pantalla Principal.dc.html, variante mobile de 3a/4a). La nav de
   *  admin no tiene "nuevo" nada — sin esto, los tabs quedan seguidos, sin FAB. */
  onFabClick?: () => void
}

const indicatorClass = (active: boolean) => cn('h-[3px] w-5 rounded-full', active ? 'bg-fg' : 'bg-border-strong')
const labelClass = (active: boolean) => cn('text-[11px] leading-none', active ? 'font-semibold text-fg' : 'text-fg-muted')

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className="flex flex-1 flex-col items-center gap-1.5 pt-2 pb-1">
      {({ isActive }) => (
        <>
          <span aria-hidden className={indicatorClass(isActive)} />
          <span className={labelClass(isActive)}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * Tab bar inferior de mobile. El indicador de tab activo es una barrita de 3px arriba del label, no
 * un ícono — así es como lo resuelve el sistema nuevo (ver el handoff). Un 5º tab "Más" abre el
 * drawer de cuenta (`Drawer` + `AccountMenu`) para las secciones que no entran cómodas acá.
 */
export function MobileTabBar({ items, drawerOpen, onOpenDrawer, onFabClick }: MobileTabBarProps) {
  const splitAt = onFabClick ? Math.ceil(items.length / 2) : items.length
  const before = items.slice(0, splitAt)
  const after = items.slice(splitAt)

  return (
    <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface lg:hidden">
      <ul className="flex items-start pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {before.map((item) => (
          <li key={item.to} className="flex flex-1">
            <TabLink to={item.to} label={item.label} />
          </li>
        ))}

        {onFabClick && (
          <li className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={onFabClick}
              aria-label="Nuevo movimiento"
              className="-mt-[18px] grid size-[52px] place-items-center rounded-[18px] bg-accent text-[26px] leading-none font-medium text-on-accent shadow-fab"
            >
              +
            </button>
          </li>
        )}

        {after.map((item) => (
          <li key={item.to} className="flex flex-1">
            <TabLink to={item.to} label={item.label} />
          </li>
        ))}

        <li className="flex flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="flex w-full flex-col items-center gap-1.5 pt-2 pb-1"
          >
            <span aria-hidden className={indicatorClass(drawerOpen)} />
            <span className={labelClass(drawerOpen)}>Más</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
