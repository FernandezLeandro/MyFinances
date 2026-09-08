import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { cn } from '@/lib/cn'
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

      <main
        className={cn(
          'min-h-dvh px-5 pt-8 pb-28 sm:px-8 lg:pt-10 lg:pb-16',
          // Mismo motivo que en `AppLayout`: sin esto, la isla de mobile corta renglones a los
          // costados en vez de que el contenido se desvanezca antes de llegar.
          '[mask-image:linear-gradient(to_bottom,#000_0_73.5vh,transparent_84.5vh)]',
          '[-webkit-mask-image:linear-gradient(to_bottom,#000_0_73.5vh,transparent_84.5vh)]',
          '[mask-attachment:fixed] [-webkit-mask-attachment:fixed]',
          'lg:[mask-image:none] lg:[-webkit-mask-image:none]',
        )}
      >
        <div className="mx-auto w-full max-w-[1080px]">
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
