import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { TopBar } from '@/app/TopBar'
import { MobileTabBar } from '@/app/MobileTabBar'
import { AccountDrawer } from '@/app/AccountMenu'
import { adminNavItems } from '@/app/adminNav'
import { useAuth } from '@/features/auth/auth-context'
import { useSyncThemeToDocument } from '@/lib/useTheme'
import { initialsFrom } from '@/lib/initials'

/**
 * Shell aparte para la cuenta admin: la misma `TopBar` que `AppLayout`, con `tone="admin"` — sin
 * nada de saldo ni de la nav financiera, ni `/ajustes` (ver `RequireAuth`, que redirige acá apenas
 * detecta `role === 'admin'`). El avatar va en gris y el punto del wordmark también: ese acento es
 * "plata que es tuya", y acá no hay plata de nadie.
 */
export function AdminLayout() {
  const { user } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useSyncThemeToDocument()

  const email = user?.email ?? null
  const initials = initialsFrom(null, email)

  return (
    <>
      <TopBar
        items={adminNavItems}
        initials={initials}
        displayName={null}
        email={email}
        showAjustes={false}
        tone="admin"
        eyebrow="Administración"
      />

      {/* El degradado antes de la isla vive en `MobileTabBar` — ver su comentario. */}
      <main className="min-h-dvh px-5 pt-8 pb-28 sm:px-8 md:pt-10 md:pb-16">
        <div className="mx-auto w-full max-w-[1280px]">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <MobileTabBar items={adminNavItems} drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />

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
