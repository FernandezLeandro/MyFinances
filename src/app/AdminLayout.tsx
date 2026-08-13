import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { cn } from '@/lib/cn'
import { Sidebar } from '@/app/Sidebar'
import { MobileTabBar } from '@/app/MobileTabBar'
import { AccountDrawer } from '@/app/AccountMenu'
import { adminNavItems } from '@/app/adminNav'
import { useAuth } from '@/features/auth/auth-context'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { initialsFrom } from '@/lib/initials'

/**
 * Shell aparte para la cuenta admin: mismo lenguaje visual que `AppLayout`, pero sin nada de saldo
 * ni de la nav financiera — el admin no tiene nada que hacer ahí (ver `RequireAuth`, que lo redirige
 * para acá apenas detecta `role === 'admin'`). El punto del wordmark va en gris, no en ácido: ese
 * acento es "plata que es tuya", y acá no hay plata de nadie. Tampoco hay `/ajustes` para el admin.
 */
export function AdminLayout() {
  const { user } = useAuth()
  const [collapsed] = useSidebarCollapsed()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const email = user?.email ?? null
  const initials = initialsFrom(null, email)

  return (
    <>
      <Grain />

      <Sidebar
        accent="chalk"
        items={adminNavItems}
        initials={initials}
        displayName={null}
        email={email}
        showAjustes={false}
        header={<p className="eyebrow mt-2">Administración</p>}
      />

      <main
        className={cn(
          'min-h-dvh px-5 pt-8 pb-28 transition-[padding] duration-200 ease-[var(--ease-out-quint)] sm:px-8 lg:pt-12 lg:pb-16',
          collapsed ? 'lg:pl-[120px]' : 'lg:pl-[276px]',
        )}
      >
        <div className="mx-auto w-full max-w-[1080px]">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <MobileTabBar
        items={adminNavItems}
        accent="chalk"
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <AccountDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initials={initials}
        displayName={null}
        email={email}
        showAjustes={false}
        overflowItems={[]}
      />
    </>
  )
}
