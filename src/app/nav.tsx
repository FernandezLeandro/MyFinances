import type { ReactNode } from 'react'
import { ArrowDownUp, Calendar, ChartNoAxesColumn, Clock, Ellipsis, LogOut, PiggyBank, Settings } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

export const navIconClass = 'size-[18px]'
// strokeWidth 1.6, no el 2 por default de lucide: matea el trazo fino que ya tenían estos íconos a
// mano (fill/linecap/linejoin "round" ya son el default de la librería, no hace falta repetirlos).
const navIconStrokeWidth = 1.6

const allNavItems: NavItem[] = [
  {
    to: '/hoy',
    label: 'Hoy',
    icon: <Clock className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: <ArrowDownUp className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/fijos',
    label: 'Fijos',
    icon: <Calendar className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/analisis',
    label: 'Análisis',
    icon: <ChartNoAxesColumn className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/ahorros',
    label: 'Ahorros',
    icon: <PiggyBank className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
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
export const gearIcon = <Settings className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const logoutIcon = <LogOut className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const moreIcon = <Ellipsis className={navIconClass} fill="currentColor" aria-hidden />
