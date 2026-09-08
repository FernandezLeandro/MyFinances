import type { ReactNode } from 'react'
import {
  ArrowDownUp,
  Calendar,
  ChartNoAxesColumn,
  Clock,
  CreditCard,
  Ellipsis,
  HandCoins,
  LogOut,
  PiggyBank,
  Settings,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

export const navIconClass = 'size-[18px]'
// La isla de mobile (`MobileTabBar`) dibuja sus íconos más grandes que el resto de la nav — 21px,
// no 18 — porque son el único elemento visible del botón (sin label al lado, como en el drawer).
export const islandIconClass = 'size-[21px]'
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
    to: '/mis-deudas',
    label: 'Mis Deudas',
    icon: <CreditCard className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
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
  {
    to: '/me-deben',
    label: 'Me Deben',
    icon: <HandCoins className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
]

/** Secciones que no se consultan seguido: se mudan al drawer de cuenta en mobile en vez de ocupar
 *  un lugar en la tab bar (ver `overflowNavItems`/`tabBarNavItems` abajo). Mis Deudas y Me Deben
 *  entran acá por el mismo motivo que Análisis/Ahorros: sobra lugar en la barra de escritorio (7
 *  ítems horizontales), pero la isla de mobile (`MobileTabBar`) es fija — Hoy, Movimientos, Fijos y
 *  Más — y no crece con la nav de escritorio. */
const OVERFLOW_ROUTES = ['/mis-deudas', '/analisis', '/ahorros', '/me-deben']

/** Barra superior de escritorio: las 7 secciones, en el orden que pidió el usuario — Hoy ·
 *  Movimientos · Fijos · Mis Deudas · Análisis · Ahorros · Me Deben. */
export const sidebarNavItems: NavItem[] = allNavItems

/** Tab bar de mobile: Hoy · Movimientos · Fijos, con íconos propios de 21px — no los 18px de
 *  `allNavItems` (pensados para ir al lado de un label, como en el drawer). El resto se muda al
 *  drawer (ver `overflowNavItems`), y el tab "Más" que lo abre se arma aparte en `MobileTabBar`. */
export const tabBarNavItems: NavItem[] = [
  {
    to: '/hoy',
    label: 'Hoy',
    icon: <Clock className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/movimientos',
    label: 'Movimientos',
    icon: <ArrowDownUp className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
  {
    to: '/fijos',
    label: 'Fijos',
    icon: <Calendar className={islandIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
  },
]

/** Lo que no entra en la tab bar de mobile y se muestra dentro del drawer de cuenta. */
export const overflowNavItems: NavItem[] = allNavItems.filter((item) => OVERFLOW_ROUTES.includes(item.to))

/** Íconos sueltos, consumidos fuera del sidebar/tab bar: `AccountMenu` (ajustes, cerrar sesión) y
 *  `MobileTabBar` (el tab "Más"). Valores JSX, no componentes — igual que los íconos de `allNavItems`
 *  arriba, así ESLint/oxlint no los confunde con exports de componente en un archivo de datos. */
export const gearIcon = <Settings className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const logoutIcon = <LogOut className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const moreIcon = <Ellipsis className={islandIconClass} fill="currentColor" aria-hidden />
