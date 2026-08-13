import type { ReactNode } from 'react'
import { navIconClass, navIconStroke } from '@/app/nav'

export interface AdminNavItem {
  to: string
  label: string
  icon: ReactNode
}

export const adminNavItems: AdminNavItem[] = [
  {
    to: '/admin/categorias',
    label: 'Categorías',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <rect x="3" y="3.5" width="6" height="6" rx="1.4" {...navIconStroke} />
        <rect x="11" y="3.5" width="6" height="6" rx="1.4" {...navIconStroke} />
        <rect x="3" y="11.5" width="6" height="6" rx="1.4" {...navIconStroke} />
        <rect x="11" y="11.5" width="6" height="6" rx="1.4" {...navIconStroke} />
      </svg>
    ),
  },
  {
    to: '/admin/activos',
    label: 'Activos',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <path d="M10 3.5 16.5 7 10 10.5 3.5 7z" {...navIconStroke} strokeLinejoin="round" />
        <path d="M3.5 7v6.5L10 17l6.5-3.5V7" {...navIconStroke} strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/admin/invitaciones',
    label: 'Invitaciones',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <path d="M2.5 5.5h15v9h-15z" {...navIconStroke} strokeLinejoin="round" />
        <path d="M2.5 5.5 10 11l7.5-5.5" {...navIconStroke} strokeLinejoin="round" />
      </svg>
    ),
  },
]
