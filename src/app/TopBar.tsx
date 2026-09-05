import { useRef, useState } from 'react'
import { NavLink } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Menu } from '@/components/ui/Menu'
import { AccountMenuItems } from '@/app/AccountMenu'
import type { NavItem } from '@/app/nav'

interface TopBarProps {
  items: NavItem[]
  initials: string
  displayName: string | null
  email: string | null
  showAjustes: boolean
}

// Sólo informativo — no controla nada. El selector de mes real de cada pantalla (Movimientos,
// Fijos, Análisis) sigue siendo el `MonthNav` de esa pantalla; hacer que este también mande hubiera
// significado sumar un mes global que hoy no existe en ningún lado (ver el handoff, decisión ya
// tomada). Por eso muestra el mes calendario actual, no un período elegible.
function currentMonthLabel() {
  const label = format(new Date(), 'MMMM yyyy', { locale: es })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Barra superior fija de desktop: logo + nav en pills + mes + cuenta. Reemplaza al `Sidebar`
 * lateral de la identidad anterior — sólo en `AppLayout` (`AdminLayout` sigue con `Sidebar`, fuera
 * del alcance de este rediseño). Oculta en mobile: ahí no hay barra superior, cada página pone su
 * propio `<header>` y la navegación baja a `MobileTabBar`.
 */
export function TopBar({ items, initials, displayName, email, showAjustes }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <header className="sticky top-0 z-20 hidden items-center gap-7 border-b border-border bg-surface px-8 py-[18px] lg:flex">
      <span className="font-display text-[15.5px] font-bold tracking-[-0.02em] text-fg">MyFinances</span>

      <nav className="flex gap-0.5 text-[13.5px]" aria-label="Secciones">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'rounded-[8px] px-3.5 py-[7px] transition-colors duration-150',
                isActive ? 'bg-inverse font-semibold text-on-inverse' : 'text-fg-secondary hover:text-fg',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="relative ml-auto flex items-center gap-3">
        <span className="text-[13px] text-fg-secondary">{currentMonthLabel()}</span>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          title={displayName ?? email ?? 'Cuenta'}
        >
          <Avatar initials={initials} shape="square" />
        </button>

        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          triggerRef={triggerRef}
          anchorClassName="top-full right-0 mt-2 w-56"
        >
          <AccountMenuItems showAjustes={showAjustes} onNavigate={() => setMenuOpen(false)} />
        </Menu>
      </div>
    </header>
  )
}
