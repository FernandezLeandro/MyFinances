import { Outlet } from 'react-router'
import { Grain } from '@/components/Grain'
import { Panel } from '@/components/ui/Panel'

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <Grain />
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-baseline gap-1.5">
          <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-chalk">
            MyFinances
          </span>
          <span aria-hidden className="size-1.5 translate-y-[-1px] rounded-full bg-acid" />
        </div>
        <Panel className="p-7">
          <Outlet />
        </Panel>
      </div>
    </div>
  )
}
