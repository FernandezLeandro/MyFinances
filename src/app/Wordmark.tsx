import { cn } from '@/lib/cn'

interface WordmarkProps {
  /** El punto va en ácido en la app financiera; en admin, en gris — ese acento es "plata que es
   *  tuya", y ahí no hay plata de nadie (ver `AdminLayout`). */
  accent: 'acid' | 'chalk'
  collapsed?: boolean
}

export function Wordmark({ accent, collapsed = false }: WordmarkProps) {
  const dotClass = accent === 'acid' ? 'bg-acid' : 'bg-chalk-faint'

  if (collapsed) {
    return (
      <span aria-hidden className="grid size-6 shrink-0 place-items-center">
        <span className={cn('size-2 rounded-full', dotClass)} />
      </span>
    )
  }

  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em] text-chalk">
        MyFinances
      </span>
      <span aria-hidden className={cn('size-1.5 translate-y-[-1px] rounded-full', dotClass)} />
    </div>
  )
}
