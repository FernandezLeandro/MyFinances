import type { ReactNode } from 'react'

export interface AdminNavItem {
  to: string
  label: string
  index: string
  icon: ReactNode
}

const iconClass = 'size-[18px]'
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' } as const

export const adminNavItems: AdminNavItem[] = [
  {
    to: '/admin/categorias',
    label: 'Categorías',
    index: '01',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <rect x="3" y="3.5" width="6" height="6" rx="1.4" {...stroke} />
        <rect x="11" y="3.5" width="6" height="6" rx="1.4" {...stroke} />
        <rect x="3" y="11.5" width="6" height="6" rx="1.4" {...stroke} />
        <rect x="11" y="11.5" width="6" height="6" rx="1.4" {...stroke} />
      </svg>
    ),
  },
  {
    to: '/admin/activos',
    label: 'Activos',
    index: '02',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <path d="M10 3.5 16.5 7 10 10.5 3.5 7z" {...stroke} strokeLinejoin="round" />
        <path d="M3.5 7v6.5L10 17l6.5-3.5V7" {...stroke} strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/admin/invitaciones',
    label: 'Invitaciones',
    index: '03',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <path d="M2.5 5.5h15v9h-15z" {...stroke} strokeLinejoin="round" />
        <path d="M2.5 5.5 10 11l7.5-5.5" {...stroke} strokeLinejoin="round" />
      </svg>
    ),
  },
]
