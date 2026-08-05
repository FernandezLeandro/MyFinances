import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  /** Marca tipográfica grande: un glifo o dos caracteres, no un ícono gris de librería. */
  glyph?: string
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ glyph = '—', title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span
        aria-hidden
        className="font-display text-[5rem] leading-none font-bold text-ink-700 select-none"
      >
        {glyph}
      </span>
      <p className="mt-5 font-display text-lg font-semibold text-chalk-dim">{title}</p>
      {hint && <p className="mt-1.5 max-w-xs text-[13px] text-chalk-faint">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
