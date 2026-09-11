import { useRef, useState } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { Brand } from '@/components/Brand'
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
  /** `app` (default) es la barra financiera: punto de acento en el wordmark, avatar en acento.
   *  `admin` es gris en los dos — ese azul significa "plata que es tuya", y el admin no tiene plata
   *  de nadie (ver `AdminLayout`). */
  tone?: 'app' | 'admin'
  /** Sólo en `admin`: "Administración" al lado del wordmark, en vez del mes informativo. */
  eyebrow?: string
}

/**
 * Barra superior fija de escritorio: logo + tabs + cuenta. Compartida por `AppLayout` y
 * `AdminLayout` — antes el admin tenía su propio `Sidebar` lateral; ahora los dos shells usan la
 * misma barra, y lo que cambia es `tone`/`eyebrow`. Oculta en mobile: ahí no hay barra superior,
 * cada página pone su propio `<header>` y la navegación baja a `MobileTabBar`.
 *
 * Sin selector de mes: era sólo informativo (no controlaba nada — cada pantalla sigue con su
 * propio `MonthNav`) y el rediseño lo saca para dejar la barra en logo + tabs + avatar.
 */
export function TopBar({ items, initials, displayName, email, showAjustes, tone = 'app', eyebrow }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isAdmin = tone === 'admin'

  return (
    <header className="sticky top-0 z-20 hidden h-[58px] items-center gap-[22px] border-b border-divider bg-surface px-[26px] md:flex">
      <div className="flex items-center gap-[8px]">
        <Brand className="size-5" accent={!isAdmin} />
        <span className="font-display text-[15px] font-bold tracking-[-0.01em] text-fg">MyFinances</span>
      </div>

      {eyebrow && <p className="eyebrow">{eyebrow}</p>}

      <nav className="flex gap-0.5 text-[13px]" aria-label="Secciones">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'rounded-[8px] px-[13px] py-[7px] transition-colors duration-150',
                isActive ? 'bg-inverse font-semibold text-on-inverse' : 'text-fg-secondary hover:text-fg',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="relative ml-auto flex items-center">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          title={displayName ?? email ?? 'Cuenta'}
        >
          <Avatar initials={initials} size="topbar" tone={isAdmin ? 'neutral' : 'accent'} />
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
