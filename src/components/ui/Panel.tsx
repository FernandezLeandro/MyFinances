import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PanelProps {
  children: ReactNode
  className?: string
  /** `flat` no eleva: sirve para agrupar sin sumar otra capa visual. `inverse` es la tarjeta oscura
   *  fija (Saldo/Fijos proyectados) — no depende del tema de la app, siempre es la superficie
   *  invertida (ver `--color-inverse` en theme.css). */
  tone?: 'raised' | 'flat' | 'inverse'
}

/**
 * Contenedor base. La elevación es por color de superficie, no por borde ni sombra: es lo que
 * separa este look del dashboard genérico de tarjetas grises con `border`.
 */
export function Panel({ children, className, tone = 'raised' }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-panel',
        tone === 'raised' && 'bg-surface',
        tone === 'flat' && 'bg-canvas ring-1 ring-fill-subtle',
        tone === 'inverse' && 'bg-inverse text-on-inverse',
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

/** Cabecera "eyebrow + hint" — el label uppercase chico de una tarjeta de cifra (Ajustes, Fijos,
 *  Mis Deudas, Me Deben). Para la cabecera de una tarjeta de lista, con título en tipografía
 *  normal y una acción a la derecha, ver `CardHeader`. */
export function PanelHeader({ title, action, hint }: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-panel pt-5 pb-4">
      <div>
        <h2 className="eyebrow">{title}</h2>
        {hint && <p className="mt-1.5 text-[13px] text-fg-muted">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  action?: ReactNode
}

/**
 * Cabecera de una tarjeta de lista — título en tipografía normal (Sora, no eyebrow uppercase) y una
 * acción a la derecha (ej. "Ver todos" en Últimos movimientos). Distinta de `PanelHeader`: esa es
 * para tarjetas de cifra, donde el título SÍ es un label chico en mayúsculas.
 */
export function CardHeader({ title, action }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-panel pt-5 pb-2">
      <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
      {action}
    </div>
  )
}
