import { Panel } from '@/components/ui/Panel'
import type { HelpStep } from '@/components/help/types'

/** Los pasos numerados de "lo básico": una tarjeta por paso, que se apilan solas cuando no entran. */
export function HelpSteps({ steps }: { steps: HelpStep[] }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[14px]">
      {steps.map((step, i) => (
        <li key={step.title}>
          <Panel className="h-full p-[22px]">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-pill bg-accent text-[12px] leading-none font-semibold text-on-accent"
            >
              {i + 1}
            </span>
            <h3 className="mt-3.5 text-[15px] font-semibold">{step.title}</h3>
            <p className="mt-[7px] text-[13px] leading-[1.55] text-fg-secondary text-pretty">{step.body}</p>
          </Panel>
        </li>
      ))}
    </ol>
  )
}
