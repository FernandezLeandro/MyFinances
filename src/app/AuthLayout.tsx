import { Outlet } from 'react-router'
import { Brand } from '@/components/Brand'
import { Panel } from '@/components/ui/Panel'
import { useSyncThemeToDocument } from '@/lib/useTheme'

export function AuthLayout() {
  useSyncThemeToDocument()

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2">
          <Brand className="size-6" />
          <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-fg">
            MyFinances
          </span>
        </div>
        <Panel className="p-7">
          <Outlet />
        </Panel>
      </div>
    </div>
  )
}
