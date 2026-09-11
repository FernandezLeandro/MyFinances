import type { ReactNode } from 'react'
import { Box, KeyRound, LayoutGrid, Mail } from 'lucide-react'
import { islandIconClass } from '@/app/nav'

export interface AdminNavItem {
  to: string
  label: string
  icon: ReactNode
}

const navIconStrokeWidth = 1.6

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
    to: '/admin/cuenta',
    label: 'Cuenta',
    icon: <KeyRound className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
]
