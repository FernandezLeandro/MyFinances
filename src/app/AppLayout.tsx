import { NavLink, Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import { navItems } from '@/app/nav'
import { useAuth } from '@/features/auth/auth-context'
import { useCurrentBalance } from '@/features/transactions/api'
import { supabase } from '@/lib/supabase'

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
  const { user } = useAuth()
  const { data: balanceCents } = useCurrentBalance()

  return (
    <>
      <Grain />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[228px] flex-col border-r border-ink-850 px-6 py-7 lg:flex">
        <Wordmark />

        <div className="mt-9">
          <p className="eyebrow">Saldo actual</p>
          <Money cents={balanceCents ?? 0} tone="acid" size="compact" className="mt-1.5" />
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

        <div className="mt-auto flex flex-col gap-2 border-t border-ink-850 pt-4">
          <p className="truncate text-[12px] text-chalk-faint">{user?.email}</p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="self-start text-[12px] text-chalk-faint transition-colors hover:text-coral"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile: sin sidebar, así que el logout necesita su propio lugar. Un ícono chico y fijo
          arriba a la derecha, no una barra de chrome — eso sigue siendo territorio del saldo. */}
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        aria-label="Cerrar sesión"
        className="fixed top-[max(1.25rem,env(safe-area-inset-top))] right-5 z-20 grid size-9 place-items-center rounded-full bg-ink-900/80 text-chalk-faint ring-1 ring-ink-800 backdrop-blur-lg transition-colors duration-150 hover:text-coral lg:hidden"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path
            d="M6.5 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10.5 11.5 14 8l-3.5-3.5M14 8H6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

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
