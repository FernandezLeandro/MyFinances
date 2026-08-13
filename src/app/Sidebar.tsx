import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { Avatar } from '@/components/ui/Avatar'
import { Menu } from '@/components/ui/Menu'
import { Wordmark } from '@/app/Wordmark'
import { AccountMenuItems } from '@/app/AccountMenu'
import type { NavItem } from '@/app/nav'

interface SidebarProps {
  accent: 'acid' | 'chalk'
  items: NavItem[]
  /** Slot bajo el wordmark — el saldo actual en la app, el eyebrow "Administración" en admin. Se
   *  oculta colapsado: no hay ancho para una cifra ni para texto. */
  header?: ReactNode
  initials: string
  displayName: string | null
  email: string | null
  showAjustes: boolean
}

/**
 * Nav lateral de desktop, compartida por `AppLayout` y `AdminLayout`. Colapsa a sólo íconos con
 * estado persistido (`useSidebarCollapsed`) y termina en un botón de cuenta que abre `Menu` con
 * `AccountMenuItems` — mismo contenido que el drawer de mobile, ver `AccountMenu.tsx`.
 */
export function Sidebar({ accent, items, header, initials, displayName, email, showAjustes }: SidebarProps) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeBarClass = accent === 'acid' ? 'bg-acid' : 'bg-chalk'

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-ink-850 py-7 transition-[width,padding] duration-200 ease-[var(--ease-out-quint)] lg:flex',
        collapsed ? 'w-[72px] px-3' : 'w-[228px] px-6',
      )}
    >
      <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between')}>
        <Wordmark accent={accent} collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-expanded={!collapsed}
          className="grid size-7 shrink-0 place-items-center rounded-control text-chalk-faint transition-colors duration-150 hover:bg-ink-900 hover:text-chalk"
        >
          <svg
            viewBox="0 0 16 16"
            className={cn('size-3.5 transition-transform duration-200 ease-[var(--ease-out-quint)]', collapsed && 'rotate-180')}
            aria-hidden
          >
            <path
              d="M10 3.5 5.5 8l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && header}

      <nav className="mt-10 flex flex-col gap-0.5" aria-label="Secciones">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-control py-2.5 text-[14px] transition-colors duration-150',
                collapsed ? 'justify-center px-0' : 'pr-3 pl-3.5',
                isActive ? 'bg-ink-850 text-chalk' : 'text-chalk-dim hover:bg-ink-900 hover:text-chalk',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className={cn('absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full', activeBarClass)}
                  />
                )}
                {item.icon}
                <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative mt-auto border-t border-ink-850 pt-4">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          title={collapsed ? (displayName ?? email ?? 'Cuenta') : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-control py-1.5 text-left transition-colors duration-150 hover:bg-ink-900',
            collapsed ? 'justify-center px-0' : 'px-2',
          )}
        >
          <Avatar initials={initials} />
          <span className={cn('min-w-0 flex-1', collapsed && 'sr-only')}>
            <span className="block truncate text-[13px] text-chalk">{displayName ?? email ?? 'Cuenta'}</span>
            {email && <span className="block truncate text-[11px] text-chalk-faint">{email}</span>}
          </span>
        </button>

        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          triggerRef={triggerRef}
          anchorClassName={collapsed ? 'bottom-0 left-full ml-2 w-56' : 'bottom-full left-0 mb-2 w-full'}
        >
          <AccountMenuItems showAjustes={showAjustes} onNavigate={() => setMenuOpen(false)} />
        </Menu>
      </div>
    </aside>
  )
}
