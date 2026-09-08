import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { cn } from '@/lib/cn'
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
 * Barra superior fija en desktop (logo + tabs + cuenta) — reemplaza al sidebar lateral de la
 * identidad anterior. En mobile no hay barra superior: el tope de la pantalla es de cada página
 * (ver el `<header>` de Hoy/Movimientos/etc.), y la navegación baja a la isla de `MobileTabBar`.
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

      <main
        className={cn(
          'min-h-dvh px-5 pt-8 pb-28 sm:px-8 lg:pt-10 lg:pb-16',
          // La isla flotante deja 265px de mobile expuestos a los costados (no ancho completo, como
          // la barra vieja) — sin desvanecer el contenido antes de llegar, quedan renglones
          // cortados a la altura de la isla. `mask-attachment: fixed` ancla el degradado al
          // viewport (no al alto de la página), así el desvanecido queda siempre pegado arriba de
          // la isla sin importar cuánto scrollees. Sólo en mobile: en desktop no hay isla.
          '[mask-image:linear-gradient(to_bottom,#000_0_73.5vh,transparent_84.5vh)]',
          '[-webkit-mask-image:linear-gradient(to_bottom,#000_0_73.5vh,transparent_84.5vh)]',
          '[mask-attachment:fixed] [-webkit-mask-attachment:fixed]',
          'lg:[mask-image:none] lg:[-webkit-mask-image:none]',
        )}
      >
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
