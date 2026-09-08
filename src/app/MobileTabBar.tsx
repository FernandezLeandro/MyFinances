import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/cn'
import type { NavItem } from '@/app/nav'
import { moreIcon } from '@/app/nav'

interface MobileTabBarProps {
  items: NavItem[]
  drawerOpen: boolean
  onOpenDrawer: () => void
  /** Sólo `AppLayout` lo pasa: abre el form de nuevo movimiento desde el `+` de la isla. La nav de
   *  admin no tiene "nuevo" nada — sin esto, el separador y el círculo de acento no se dibujan. */
  onFabClick?: () => void
}

function IslandButton({ to, icon }: { to: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150',
          isActive ? 'bg-surface text-inverse' : 'text-on-inverse-muted',
        )
      }
    >
      {icon}
    </NavLink>
  )
}

/**
 * Isla oscura flotante de mobile (tanda 14, variante 14c) — reemplaza la barra full-width anterior.
 * Una sola pieza despegada del piso (`bottom-[22px]`), con el mismo negro que la tarjeta de saldo
 * invertida. Cuatro botones de 44px con íconos de 21px, sin etiquetas de texto: el activo se marca
 * con fondo claro, no con un indicador aparte. El `+` va separado por una línea y siempre dibujado
 * como dos trazos SVG (`<Plus>` de lucide) — el carácter tipográfico se apoya en la línea de base y
 * queda descentrado dentro del círculo.
 *
 * `items` trae sólo las secciones que caben fijas (Hoy · Movimientos · Fijos en la app, las 4 del
 * admin) — el resto vive en el drawer de cuenta, disparado por el tab "Más".
 */
export function MobileTabBar({ items, drawerOpen, onOpenDrawer, onFabClick }: MobileTabBarProps) {
  return (
    <>
      {/* Vignette fija al viewport (no un mask sobre el contenido): un mask con `mask-attachment:
          fixed` aplicado al scroll de la página deja lo que caiga en esa franja atenuado PARA
          SIEMPRE, incluso después de scrollear — en una pantalla corta como Hoy, la última tarjeta
          puede terminar clavada ahí sin salida. Este degradado, en cambio, es un overlay aparte que
          se queda quieto en la pantalla: lo que pasa por detrás se atenúa sólo mientras está bajo
          la isla, y al seguir scrolleando queda completamente visible arriba, sin ningún rastro. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-t from-canvas to-transparent lg:hidden"
      />

      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-[22px] z-20 flex justify-center lg:hidden">
        <ul className="flex items-center gap-1 rounded-pill bg-inverse px-2 py-2 shadow-island">
          {items.map((item) => (
            <li key={item.to}>
              <IslandButton to={item.to} icon={item.icon} />
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-label="Más"
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-150',
                drawerOpen ? 'bg-surface text-inverse' : 'text-on-inverse-muted',
              )}
            >
              {moreIcon}
            </button>
          </li>

          {onFabClick && (
            <>
              <li aria-hidden className="mx-1 h-7 w-px shrink-0 bg-inverse-divider" />
              <li>
                <button
                  type="button"
                  onClick={onFabClick}
                  aria-label="Nuevo movimiento"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent"
                >
                  <Plus className="size-6" strokeWidth={2} aria-hidden />
                </button>
              </li>
            </>
          )}
        </ul>
      </nav>
    </>
  )
}
