import { Outlet } from 'react-router'
import { Panel } from '@/components/ui/Panel'
import { useSyncThemeToDocument } from '@/lib/useTheme'

export function AuthLayout() {
  useSyncThemeToDocument()

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-baseline gap-1.5">
          <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-fg">
            MyFinances
          </span>
          <span aria-hidden className="size-1.5 translate-y-[-1px] rounded-full bg-accent" />
        </div>
        <Panel className="p-7">
          <Outlet />
        </Panel>
      </div>
    </div>
  )
}
