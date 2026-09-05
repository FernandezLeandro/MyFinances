import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { TopBar } from '@/app/TopBar'
import { MobileTabBar } from '@/app/MobileTabBar'
import { AccountDrawer } from '@/app/AccountMenu'
import { overflowNavItems, sidebarNavItems, tabBarNavItems } from '@/app/nav'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/profile/api'
import { useSyncThemeToDocument } from '@/lib/useTheme'
import { initialsFrom } from '@/lib/initials'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'

/**
 * Barra superior fija en desktop (logo + nav en pills + mes + cuenta) — reemplaza al sidebar
 * lateral de la identidad anterior. En mobile no hay barra superior: el tope de la pantalla es de
 * cada página (ver el `<header>` de Hoy/Movimientos/etc.), y la navegación baja a `MobileTabBar`.
 */
export function AppLayout() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Instancia propia para el FAB de mobile: la de Hoy sigue viviendo en Hoy.tsx, para su botón
  // "+ Nuevo movimiento" de la tarjeta de saldo — mismo patrón de montar el diálogo sólo mientras
  // está abierto, así las dos instancias nunca compiten por el mismo estado.
  const [fabDialogOpen, setFabDialogOpen] = useState(false)
  useSyncThemeToDocument()

  const displayName = profile?.displayName ?? null
  const email = user?.email ?? null
  const initials = initialsFrom(displayName, email)

  return (
    <>
      <TopBar items={sidebarNavItems} initials={initials} displayName={displayName} email={email} showAjustes />

      <main className="min-h-dvh px-5 pt-8 pb-28 sm:px-8 lg:pt-10 lg:pb-16">
        <div className="mx-auto w-full max-w-[1080px]">
          {/* Sólo el contenido suspende, no el shell (nav/header) — así no parpadea al navegar. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <MobileTabBar
        items={tabBarNavItems}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
        onFabClick={() => setFabDialogOpen(true)}
      />

      <AccountDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initials={initials}
        displayName={displayName}
        email={email}
        showAjustes
        overflowItems={overflowNavItems}
      />

      {fabDialogOpen && <TransactionFormDialog open={fabDialogOpen} onClose={() => setFabDialogOpen(false)} />}
    </>
  )
}
