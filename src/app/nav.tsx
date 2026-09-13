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
import { can } from '@/features/access/plan'
import type { Capability, Plan } from '@/features/access/plan'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  /** Sin `cap`, el ítem es de todos los planes (Hoy). Con `cap`, `navItemsFor` lo saca de la nav
   *  para quien no la tenga — mismo criterio que gatea la ruta en `App.tsx` (`RequireCapability`),
   *  nunca al revés: ocultar de la nav sin gatear la ruta dejaría la pantalla alcanzable a mano. */
  cap?: Capability
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
    cap: 'movimientos',
  },
  {
    to: '/fijos',
    label: 'Fijos',
    icon: <Calendar className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
    cap: 'fijos',
  },
  {
    to: '/mis-deudas',
    label: 'Mis Deudas',
    icon: <CreditCard className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
    cap: 'mis-deudas',
  },
  {
    to: '/analisis',
    label: 'Análisis',
    icon: <ChartNoAxesColumn className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
    cap: 'analisis',
  },
  {
    to: '/ahorros',
    label: 'Ahorros',
    icon: <PiggyBank className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
    cap: 'ahorros',
  },
  {
    to: '/me-deben',
    label: 'Me Deben',
    icon: <HandCoins className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />,
    cap: 'me-deben',
  },
]

/** Secciones que no se consultan seguido: se mudan al drawer de cuenta en mobile en vez de ocupar
 *  un lugar en la tab bar (ver `overflowNavItems`/`tabBarNavItems` abajo). Mis Deudas y Me Deben
 *  entran acá por el mismo motivo que Análisis/Ahorros: sobra lugar en la barra de escritorio (7
 *  ítems horizontales), pero la isla de mobile (`MobileTabBar`) es fija — Hoy, Movimientos, Fijos y
 *  Más — y no crece con la nav de escritorio. */
const OVERFLOW_ROUTES = ['/mis-deudas', '/analisis', '/ahorros', '/me-deben']

/** Pone Fijos antes que Movimientos — sólo para un plan sin `movimientos-manuales` (BASIC), donde
 *  Fijos es el core y Movimientos es sólo la consecuencia de pagarlos (ver el plan "BASIC centrado
 *  en fijos", bloque 4). El resto de los planes no llama a esto — no-op si alguno de los dos no
 *  está en la lista, o si Fijos ya viene antes. */
function fijosAntesQueMovimientos(items: NavItem[]): NavItem[] {
  const fijosIdx = items.findIndex((i) => i.to === '/fijos')
  const movIdx = items.findIndex((i) => i.to === '/movimientos')
  if (fijosIdx === -1 || movIdx === -1 || fijosIdx < movIdx) return items
  const reordered = [...items]
  const [fijos] = reordered.splice(fijosIdx, 1)
  reordered.splice(movIdx, 0, fijos!)
  return reordered
}

/** Barra superior de escritorio: las 7 secciones, en el orden que pidió el usuario — Hoy ·
 *  Movimientos · Fijos · Mis Deudas · Análisis · Ahorros · Me Deben — filtradas por lo que el plan
 *  de la cuenta puede ver. Un plan restringido nunca ve ni la sección en la barra ni en el drawer:
 *  la ruta detrás está igual de gateada (`RequireCapability` en `App.tsx`), esto es sólo para no
 *  ofrecer un link a algo que al clickear rebota.
 *
 *  Sin `movimientos-manuales` (BASIC): Fijos pasa antes que Movimientos — es el plan de control de
 *  fijos, Movimientos ahí es sólo el rastro de haberlos pagado. */
export function sidebarNavItemsFor(plan: Plan): NavItem[] {
  const items = allNavItems.filter((item) => !item.cap || can(plan, item.cap))
  return can(plan, 'movimientos-manuales') ? items : fijosAntesQueMovimientos(items)
}

/** Tab bar de mobile: Hoy · Movimientos · Fijos (Hoy · Fijos · Movimientos sin
 *  `movimientos-manuales`, mismo criterio que `sidebarNavItemsFor`), con íconos propios de 21px —
 *  no los 18px de `allNavItems` (pensados para ir al lado de un label, como en el drawer). El resto
 *  se muda al drawer (ver `overflowNavItems`), y el tab "Más" que lo abre se arma aparte en
 *  `MobileTabBar`. */
export function tabBarNavItemsFor(plan: Plan): NavItem[] {
  const items: NavItem[] = [
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
  return can(plan, 'movimientos-manuales') ? items : fijosAntesQueMovimientos(items)
}

/** Lo que no entra en la tab bar de mobile y se muestra dentro del drawer de cuenta, filtrado por
 *  plan igual que `sidebarNavItemsFor` — un plan restringido puede terminar con este grupo vacío
 *  (`basic`, que sólo tiene Movimientos y Fijos, ya cubiertos por la tab bar fija), y el drawer ya
 *  sabe ocultar la sección "Secciones" cuando la lista queda en cero (ver `AccountDrawer`). */
export function overflowNavItemsFor(plan: Plan): NavItem[] {
  return allNavItems.filter((item) => OVERFLOW_ROUTES.includes(item.to) && (!item.cap || can(plan, item.cap)))
}

/** Íconos sueltos, consumidos fuera del sidebar/tab bar: `AccountMenu` (ajustes, cerrar sesión) y
 *  `MobileTabBar` (el tab "Más"). Valores JSX, no componentes — igual que los íconos de `allNavItems`
 *  arriba, así ESLint/oxlint no los confunde con exports de componente en un archivo de datos. */
export const gearIcon = <Settings className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const logoutIcon = <LogOut className={navIconClass} strokeWidth={navIconStrokeWidth} aria-hidden />

export const moreIcon = <Ellipsis className={islandIconClass} fill="currentColor" aria-hidden />
