import { Panel } from '@/components/ui/Panel'
import type { HelpFaqItem } from '@/components/help/types'

/** Las preguntas que aparecen seguido. Siempre visibles, sin acordeón: son pocas y se buscan con Ctrl+F. */
export function HelpFaq({ items }: { items: HelpFaqItem[] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
      {items.map((item) => (
        <Panel key={item.question} className="px-[22px] py-5">
          <dt className="text-sm font-semibold text-pretty">{item.question}</dt>
          <dd className="mt-2 text-[13px] leading-[1.6] text-fg-secondary text-pretty">{item.answer}</dd>
        </Panel>
      ))}
    </dl>
  )
}
