import type { ReactNode } from 'react'
import { Box, KeyRound, LayoutGrid, Mail, Users } from 'lucide-react'
import { islandIconClass } from '@/app/nav'

export interface AdminNavItem {
  to: string
  label: string
  icon: ReactNode
}

const navIconStrokeWidth = 1.6

/** Barra de escritorio: las 5 secciones — de sobra en una `TopBar` horizontal. */
export const adminNavItems: AdminNavItem[] = [
  {
    to: '/admin/categorias',
    label: 'Categorías',
    icon: <LayoutGrid className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/admin/activos',
    label: 'Activos',
    icon: <Box className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/admin/invitaciones',
    label: 'Invitaciones',
    icon: <Mail className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/admin/usuarios',
    label: 'Usuarios',
    icon: <Users className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/admin/cuenta',
    label: 'Cuenta',
    icon: <KeyRound className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
]

/** Isla de mobile: 4 items + "Más" ya es el máximo cómodo en 320px (ver comentario de
 *  `MobileTabBar`) — con las 5 secciones de arriba entraría al filo. "Cuenta" es la que menos se
 *  consulta (sólo cambiar la contraseña del admin), así que se muda al drawer — mismo criterio que
 *  `OVERFLOW_ROUTES` usa en la app financiera. */
export const adminTabBarItems: AdminNavItem[] = adminNavItems.filter((item) => item.to !== '/admin/cuenta')

export const adminOverflowItems: AdminNavItem[] = adminNavItems.filter((item) => item.to === '/admin/cuenta')
