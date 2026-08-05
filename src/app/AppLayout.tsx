import { NavLink, Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import { navItems } from '@/app/nav'
// Bloque 0: el saldo de la nav sale del mock. En el Bloque 2 pasa a ser una query de TanStack Query.
import { currentBalance } from '@/lib/mock'

function Wordmark() {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-chalk">
        saldo
      </span>
      <span aria-hidden className="size-1.5 translate-y-[-1px] rounded-full bg-acid" />
    </div>
  )
}

/**
 * Nav lateral angosta en desktop, tab bar inferior en mobile. Deliberadamente no hay header
 * horizontal: el tope de la pantalla es territorio de la cifra de saldo, no de una barra de chrome.
 */
export function AppLayout() {
  return (
    <>
      <Grain />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[228px] flex-col border-r border-ink-850 px-6 py-7 lg:flex">
        <Wordmark />

        <div className="mt-9">
          <p className="eyebrow">Saldo actual</p>
          <Money cents={currentBalance} tone="acid" size="compact" className="mt-1.5" />
        </div>

        <nav className="mt-10 flex flex-col gap-0.5" aria-label="Secciones">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-control py-2.5 pr-3 pl-3.5 text-[14px] transition-colors duration-150',
                  isActive ? 'bg-ink-850 text-chalk' : 'text-chalk-dim hover:bg-ink-900 hover:text-chalk',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-acid"
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      'font-mono text-[11px] tabular-nums',
                      isActive ? 'text-acid' : 'text-chalk-faint',
                    )}
                  >
                    {item.index}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <p className="mt-auto text-[11px] text-ink-500">Datos de ejemplo · Bloque 0</p>
      </aside>

      <main className="min-h-dvh px-5 pt-8 pb-28 sm:px-8 lg:pt-12 lg:pb-16 lg:pl-[276px]">
        <div className="mx-auto w-full max-w-[1080px]">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-850 bg-ink-900/85 backdrop-blur-lg lg:hidden"
      >
        <ul className="flex pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-[11px] transition-colors duration-150',
                    isActive ? 'text-acid' : 'text-chalk-faint',
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
