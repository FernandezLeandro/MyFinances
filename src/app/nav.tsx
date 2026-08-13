import type { ReactNode } from 'react'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

export const navIconClass = 'size-[18px]'
export const navIconStroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' } as const

const allNavItems: NavItem[] = [
  {
    to: '/hoy',
    label: 'Hoy',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <circle cx="10" cy="10" r="7" {...navIconStroke} />
        <path d="M10 6.5v7M7.8 8.2h4.4M7.8 11.8h4.4" {...navIconStroke} />
      </svg>
    ),
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <path d="M6.5 3.5v13M3.5 13.5l3 3 3-3" {...navIconStroke} />
        <path d="M13.5 16.5v-13M10.5 6.5l3-3 3 3" {...navIconStroke} />
      </svg>
    ),
  },
  {
    to: '/fijos',
    label: 'Fijos',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <rect x="3" y="4.5" width="14" height="12.5" rx="2" {...navIconStroke} />
        <path d="M3 8.5h14M6.8 3v3M13.2 3v3" {...navIconStroke} />
      </svg>
    ),
  },
  {
    to: '/analisis',
    label: 'Análisis',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <path d="M4.5 16.5v-5M10 16.5V4.5M15.5 16.5v-8" {...navIconStroke} />
      </svg>
    ),
  },
  {
    to: '/ahorros',
    label: 'Ahorros',
    icon: (
      <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
        <ellipse cx="11" cy="10.5" rx="5.5" ry="4" {...navIconStroke} />
        <circle cx="4.8" cy="11" r="1.6" {...navIconStroke} />
        <path d="M11.5 7 13 6.4" {...navIconStroke} />
        <path d="M7 6.7 8 4.8" {...navIconStroke} />
        <path d="M8.5 14.3v2.2" {...navIconStroke} />
        <path d="M14 14.3v2.2" {...navIconStroke} />
      </svg>
    ),
  },
]

/** Sidebar de desktop: las 5 secciones — ahí sobra ancho para no tener que recortar nada. */
export const sidebarNavItems: NavItem[] = allNavItems

/** Tab bar de mobile: 4 secciones + el tab "Más" (ver `MobileTabBar`). Ahorros se muda al drawer. */
export const tabBarNavItems: NavItem[] = allNavItems.filter((item) => item.to !== '/ahorros')

/** Lo que no entra en la tab bar de mobile y se muestra dentro del drawer de cuenta. */
export const overflowNavItems: NavItem[] = allNavItems.filter((item) => item.to === '/ahorros')

/** Íconos sueltos, consumidos fuera del sidebar/tab bar: `AccountMenu` (ajustes, cerrar sesión) y
 *  `MobileTabBar` (el tab "Más"). Valores JSX, no componentes — igual que los íconos de `allNavItems`
 *  arriba, así ESLint/oxlint no los confunde con exports de componente en un archivo de datos. */
export const gearIcon = (
  <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
    <circle cx="10" cy="10" r="2.75" {...navIconStroke} />
    <path
      d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.6 5.4l-1.4 1.4M6.8 13.2l-1.4 1.4M14.6 14.6l-1.4-1.4M6.8 6.8 5.4 5.4"
      {...navIconStroke}
    />
  </svg>
)

export const logoutIcon = (
  <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
    <path
      d="M8 3H4.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H8M13 13.5 17 10l-4-3.5M17 10H8"
      {...navIconStroke}
      strokeLinejoin="round"
    />
  </svg>
)

export const moreIcon = (
  <svg viewBox="0 0 20 20" className={navIconClass} aria-hidden>
    <circle cx="4.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
  </svg>
)
