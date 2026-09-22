import type { ReactNode } from 'react'
import type { HelpEffectTone } from '@/components/help/types'

// Cada tono define su clase completa: `cn()` no dedupea, así que compartir una base con colores
// sueltos dejaría el ganador al azar (mismo criterio que `Badge`). No se reusa `Badge` porque le
// falta el tono acento chico y su radio es 6px; acá el chip es de 4px (`rounded-chip`).
const tones: Record<HelpEffectTone, string> = {
  neutral: 'rounded-chip bg-fill-subtle px-2 py-[3px] text-[11.5px] font-semibold text-fg-secondary',
  accent: 'rounded-chip bg-accent-soft px-2 py-[3px] text-[11.5px] font-semibold text-accent-text',
  amber: 'rounded-chip bg-badge-amber-bg px-2 py-[3px] text-[11.5px] font-semibold text-badge-amber-fg',
  red: 'rounded-chip bg-badge-red-bg px-2 py-[3px] text-[11.5px] font-semibold text-badge-red-fg',
}

/** El chip de "qué le hace esto a tu saldo" al lado del nombre de una acción. */
export function HelpChip({ tone, children }: { tone: HelpEffectTone; children: ReactNode }) {
  return <span className={`inline-block leading-none ${tones[tone]}`}>{children}</span>
}
