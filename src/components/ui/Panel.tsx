import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PanelProps {
  children: ReactNode
  className?: string
  /** `flat` no eleva: sirve para agrupar sin sumar otra capa visual. */
  tone?: 'raised' | 'flat'
}

/**
 * Contenedor base. La elevación es por luminosidad de la superficie, no por borde ni sombra:
 * es lo que separa este look del dashboard genérico de tarjetas grises con `border`.
 */
export function Panel({ children, className, tone = 'raised' }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-panel',
        tone === 'raised' ? 'bg-ink-900' : 'bg-ink-950 ring-1 ring-ink-800',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface PanelHeaderProps {
  title: string
  action?: ReactNode
  hint?: string
}

export function PanelHeader({ title, action, hint }: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
      <div>
        <h2 className="eyebrow">{title}</h2>
        {hint && <p className="mt-1.5 text-[13px] text-chalk-faint">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
