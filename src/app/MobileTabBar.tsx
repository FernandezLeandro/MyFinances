import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { moreIcon } from '@/app/nav'
import type { NavItem } from '@/app/nav'

interface MobileTabBarProps {
  items: NavItem[]
  accent: 'acid' | 'chalk'
  drawerOpen: boolean
  onOpenDrawer: () => void
}

/**
 * Tab bar inferior de mobile: las secciones que entran cómodas + un 5º tab "Más" que abre el drawer
 * de cuenta (`Drawer` + `AccountMenu`) en vez de flotar dos botones sueltos arriba de la pantalla.
 */
export function MobileTabBar({ items, accent, drawerOpen, onOpenDrawer }: MobileTabBarProps) {
  const activeClass = accent === 'acid' ? 'text-acid' : 'text-chalk'

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-850 bg-ink-900/85 backdrop-blur-lg lg:hidden"
    >
      <ul className="flex pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-[11px] transition-colors duration-150',
                  isActive ? activeClass : 'text-chalk-faint',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          </li>
        ))}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              'flex w-full flex-col items-center gap-1 pt-2.5 pb-1.5 text-[11px] transition-colors duration-150',
              drawerOpen ? activeClass : 'text-chalk-faint',
            )}
          >
            {moreIcon}
            Más
          </button>
        </li>
      </ul>
    </nav>
  )
}
