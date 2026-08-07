import { Link, NavLink, Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { cn } from '@/lib/cn'
import { adminNavItems } from '@/app/adminNav'
import { useAuth } from '@/features/auth/auth-context'
import { supabase } from '@/lib/supabase'

function Wordmark() {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-chalk">
        MyFinances
      </span>
      <span aria-hidden className="size-1.5 translate-y-[-1px] rounded-full bg-chalk-faint" />
    </div>
  )
}

/**
 * Shell aparte para la cuenta admin: mismo lenguaje visual que `AppLayout`, pero sin nada de saldo
 * ni de la nav financiera — el admin no tiene nada que hacer ahí (ver `RequireAuth`, que lo redirige
 * para acá apenas detecta `role === 'admin'`). El punto del wordmark va en gris, no en ácido: ese
 * acento es "plata que es tuya", y acá no hay plata de nadie.
 */
export function AdminLayout() {
  const { user } = useAuth()

  return (
    <>
      <Grain />

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[228px] flex-col border-r border-ink-850 px-6 py-7 lg:flex">
        <Wordmark />
        <p className="eyebrow mt-2">Administración</p>

        <nav className="mt-10 flex flex-col gap-0.5" aria-label="Secciones">
          {adminNavItems.map((item) => (
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
                      className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-chalk"
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn('font-mono text-[11px] tabular-nums', isActive ? 'text-chalk' : 'text-chalk-faint')}
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

      <div className="fixed top-[max(1.25rem,env(safe-area-inset-top))] right-5 z-20 flex gap-2 lg:hidden">
        <Link
          to="/admin"
          className="grid size-9 place-items-center rounded-full bg-ink-900/80 text-chalk-faint ring-1 ring-ink-800 backdrop-blur-lg"
        >
          <span className="font-display text-sm font-bold">A</span>
        </Link>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          aria-label="Cerrar sesión"
          className="grid size-9 place-items-center rounded-full bg-ink-900/80 text-chalk-faint ring-1 ring-ink-800 backdrop-blur-lg transition-colors duration-150 hover:text-coral"
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
      </div>

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
          {adminNavItems.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 pt-2.5 pb-1.5 text-[11px] transition-colors duration-150',
                    isActive ? 'text-chalk' : 'text-chalk-faint',
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
