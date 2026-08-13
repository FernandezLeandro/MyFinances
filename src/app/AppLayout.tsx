import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { Money } from '@/components/ui/Money'
import { PageSkeleton } from '@/components/ui/PageSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { Sidebar } from '@/app/Sidebar'
import { MobileTabBar } from '@/app/MobileTabBar'
import { AccountDrawer } from '@/app/AccountMenu'
import { overflowNavItems, sidebarNavItems, tabBarNavItems } from '@/app/nav'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/profile/api'
import { useCurrentBalance } from '@/features/transactions/api'
import { useHiddenBalance } from '@/lib/useHiddenBalance'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { initialsFrom } from '@/lib/initials'

/**
 * Nav lateral colapsable en desktop, tab bar inferior + drawer de cuenta en mobile. Deliberadamente
 * no hay header horizontal: el tope de la pantalla es territorio de la cifra de saldo, no de una
 * barra de chrome.
 */
export function AppLayout() {
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { data: balanceCents, isPending: isBalancePending } = useCurrentBalance()
  const [balanceHidden] = useHiddenBalance('saldo-actual')
  const [collapsed] = useSidebarCollapsed()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const displayName = profile?.displayName ?? null
  const email = user?.email ?? null
  const initials = initialsFrom(displayName, email)

  return (
    <>
      <Grain />

      <Sidebar
        accent="acid"
        items={sidebarNavItems}
        initials={initials}
        displayName={displayName}
        email={email}
        showAjustes
        header={
          <div className="mt-9">
            <p className="eyebrow">Saldo actual</p>
            {isBalancePending ? (
              <Skeleton className="mt-2 h-6 w-24" />
            ) : (
              <Money cents={balanceCents ?? 0} tone="acid" size="compact" className="mt-1.5" hidden={balanceHidden} />
            )}
          </div>
        }
      />

      <main
        className={cn(
          'min-h-dvh px-5 pt-8 pb-28 transition-[padding] duration-200 ease-[var(--ease-out-quint)] sm:px-8 lg:pt-12 lg:pb-16',
          collapsed ? 'lg:pl-[120px]' : 'lg:pl-[276px]',
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
        accent="acid"
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen(true)}
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
    </>
  )
}
