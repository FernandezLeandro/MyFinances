import type { ReactNode } from 'react'

export interface NavItem {
  to: string
  label: string
  /** Índice editorial: numerar las secciones le da orden a la nav sin necesidad de iconografía pesada. */
  index: string
  icon: ReactNode
}

const iconClass = 'size-[18px]'
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' } as const

export const navItems: NavItem[] = [
  {
    to: '/hoy',
    label: 'Hoy',
    index: '01',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <circle cx="10" cy="10" r="7" {...stroke} />
        <path d="M10 6.5v7M7.8 8.2h4.4M7.8 11.8h4.4" {...stroke} />
      </svg>
    ),
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    index: '02',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <path d="M6.5 3.5v13M3.5 13.5l3 3 3-3" {...stroke} />
        <path d="M13.5 16.5v-13M10.5 6.5l3-3 3 3" {...stroke} />
      </svg>
    ),
  },
  {
    to: '/fijos',
    label: 'Fijos',
    index: '03',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <rect x="3" y="4.5" width="14" height="12.5" rx="2" {...stroke} />
        <path d="M3 8.5h14M6.8 3v3M13.2 3v3" {...stroke} />
      </svg>
    ),
  },
  {
    to: '/analisis',
    label: 'Análisis',
    index: '04',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <path d="M4.5 16.5v-5M10 16.5V4.5M15.5 16.5v-8" {...stroke} />
      </svg>
    ),
  },
  {
    to: '/patrimonio',
    label: 'Patrimonio',
    index: '05',
    icon: (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden>
        <path d="M10 3.5 16.5 7 10 10.5 3.5 7z" {...stroke} strokeLinejoin="round" />
        <path d="M3.5 7v6.5L10 17l6.5-3.5V7" {...stroke} strokeLinejoin="round" />
      </svg>
    ),
  },
]
