import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { TopBar } from '@/app/TopBar'
import { MobileTabBar } from '@/app/MobileTabBar'
import { AccountDrawer } from '@/app/AccountMenu'
import { MAIN_SHELL_CLASS } from '@/app/mainShell'
import { overflowNavItemsFor, sidebarNavItemsFor, tabBarNavItemsFor } from '@/app/nav'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/profile/api'
import { useSyncThemeToDocument } from '@/lib/useTheme'
import { initialsFrom } from '@/lib/initials'
import { can } from '@/features/access/plan'
import { usePlan } from '@/features/access/useCan'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'
import { RegisterFixedExpenseDialog } from '@/features/fixed-expenses/RegisterFixedExpenseDialog'

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
  // `usePlan()` cae a `FALLBACK_PLAN` (Básico) mientras el perfil no resolvió — el plan más
  // restrictivo, así la nav no parpadea con secciones de más durante ese instante y después las
  // achica de golpe.
  const plan = usePlan()

  return (
    <>
      <TopBar items={sidebarNavItemsFor(plan)} initials={initials} displayName={displayName} email={email} showAjustes />

      {/* El degradado que difumina el contenido antes de llegar a la isla vive en `MobileTabBar`,
          como un overlay fijo al viewport — no acá como mask del scroll (ver su comentario: un mask
          con `mask-attachment: fixed` deja lo que caiga en esa franja atenuado para siempre, sin
          que scrollear lo despeje). */}
      <main className={MAIN_SHELL_CLASS}>
        <div className="mx-auto w-full max-w-[1600px] xl:w-[90%]">
          {/* Sólo el contenido suspende, no el shell (nav/header) — así no parpadea al navegar. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <MobileTabBar
        items={tabBarNavItemsFor(plan)}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
        onFabClick={() => setFabDialogOpen(true)}
        fabLabel={can(plan, 'movimientos-manuales') ? 'Nuevo movimiento' : 'Registrar en un fijo'}
      />

      <AccountDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initials={initials}
        displayName={displayName}
        email={email}
        showAjustes
        overflowItems={overflowNavItemsFor(plan)}
      />

      {fabDialogOpen &&
        (can(plan, 'movimientos-manuales') ? (
          <TransactionFormDialog open={fabDialogOpen} onClose={() => setFabDialogOpen(false)} />
        ) : (
          <RegisterFixedExpenseDialog open={fabDialogOpen} onClose={() => setFabDialogOpen(false)} />
        ))}
    </>
  )
}
