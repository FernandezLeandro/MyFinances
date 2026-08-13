import { NavLink, useNavigate } from 'react-router'
import { cn } from '@/lib/cn'
import { MenuItem } from '@/components/ui/Menu'
import { Drawer } from '@/components/ui/Drawer'
import { Avatar } from '@/components/ui/Avatar'
import { gearIcon, logoutIcon } from '@/app/nav'
import type { NavItem } from '@/app/nav'
import { supabase } from '@/lib/supabase'

interface AccountMenuItemsProps {
  /** El admin no tiene `/ajustes` — ver `RequireAdmin`, que lo saca de la nav financiera por completo. */
  showAjustes: boolean
  /** Cierra el popover/drawer que contiene este menú, antes de navegar o cerrar sesión. */
  onNavigate: () => void
}

/**
 * Las opciones de cuenta en un solo lugar: las consume tanto el popover de desktop (`Menu`) como el
 * drawer de mobile (`Drawer`), para no tener dos definiciones de "qué hay en el menú de cuenta".
 */
export function AccountMenuItems({ showAjustes, onNavigate }: AccountMenuItemsProps) {
  const navigate = useNavigate()

  function goToAjustes() {
    onNavigate()
    navigate('/ajustes')
  }

  function signOut() {
    onNavigate()
    supabase.auth.signOut()
  }

  return (
    <>
      {showAjustes && (
        <MenuItem onClick={goToAjustes} icon={gearIcon}>
          Ajustes
        </MenuItem>
      )}
      <MenuItem onClick={signOut} tone="danger" icon={logoutIcon}>
        Cerrar sesión
      </MenuItem>
    </>
  )
}

interface AccountDrawerProps {
  open: boolean
  onClose: () => void
  initials: string
  displayName: string | null
  email: string | null
  showAjustes: boolean
  /** Secciones que no entran en la tab bar de mobile (ver `overflowNavItems` en `nav.tsx`) — hoy
   *  sólo Patrimonio. Vacío en admin, y ese grupo directamente no se renderiza. */
  overflowItems: NavItem[]
}

/**
 * Contenido del drawer de cuenta en mobile: header de identidad, las secciones que no entraron en
 * la tab bar, y las mismas `AccountMenuItems` que usa el popover de desktop.
 */
export function AccountDrawer({
  open,
  onClose,
  initials,
  displayName,
  email,
  showAjustes,
  overflowItems,
}: AccountDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose}>
      <div className="flex items-center gap-3 px-5 pb-6">
        <Avatar initials={initials} size="md" />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-chalk">{displayName ?? email ?? 'Cuenta'}</p>
          {email && <p className="truncate text-[12px] text-chalk-faint">{email}</p>}
        </div>
      </div>

      {overflowItems.length > 0 && (
        <div className="border-t border-ink-850 px-2 py-2">
          <p className="eyebrow px-3.5 pb-1.5">Secciones</p>
          {overflowItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-control px-3.5 py-2 text-[13px] transition-colors duration-150',
                  isActive ? 'bg-ink-850 text-chalk' : 'text-chalk-dim hover:bg-ink-800 hover:text-chalk',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      <div className="mt-auto border-t border-ink-850 px-2 pt-2">
        <AccountMenuItems showAjustes={showAjustes} onNavigate={onClose} />
      </div>
    </Drawer>
  )
}
