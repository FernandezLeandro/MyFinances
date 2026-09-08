import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Punto de estado de una sección. El rojo es "hay algo que resolver", el acento "suma o hay algo
 *  elegido", el ámbar un aviso blando y el gris el neutro. La línea de contexto que va al lado
 *  nombra el caso concreto ("Mercado Pago no coincide"), nunca un conteo. */
export type DialogStatus = 'alert' | 'accent' | 'warn' | 'neutral'

const dotClasses: Record<DialogStatus, string> = {
  alert: 'bg-negative',
  accent: 'bg-accent',
  warn: 'bg-dot-warn',
  neutral: 'bg-border-strong',
}

const contextClasses: Record<DialogStatus, string> = {
  alert: 'text-badge-red-fg',
  accent: 'text-fg-secondary',
  warn: 'text-badge-amber-fg',
  neutral: 'text-fg-secondary',
}

function StatusLine({ status, children }: { status: DialogStatus; children: ReactNode }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotClasses[status])} />
      <span className={cn('truncate text-[11.5px]', contextClasses[status])}>{children}</span>
    </div>
  )
}

/**
 * Bloque de resumen de un diálogo: rótulo, una línea de contexto y la cifra a la derecha, sobre la
 * superficie hundida. Es el dato que no se toca — en Cuadrar saldo, el saldo según la app; en las
 * confirmaciones de pago, el detalle de lo que se va a generar.
 */
export function DialogSummaryBlock({
  title,
  hint,
  figure,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  figure?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex items-center gap-3 rounded-control bg-surface-sunken px-[15px] py-[13px]', className)}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-fg-secondary">{hint}</div>}
      </div>
      {figure && <span className="tnum shrink-0 font-display text-[17px] font-semibold text-fg">{figure}</span>}
    </div>
  )
}

/**
 * Sección plegable de un diálogo-herramienta (arquetipo 4). Cerrada es una sola línea: cursor,
 * nombre, punto de estado con su contexto y el subtotal a la derecha.
 *
 * Sólo una abierta a la vez — la regla la impone el diálogo que las monta, no el componente: con
 * acordeón por fila, dejar que se acumulen estira el diálogo sin techo.
 */
export function DialogSection({
  title,
  status = 'neutral',
  context,
  subtotal,
  subtotalTone = 'fg',
  open,
  onToggle,
  children,
  footer,
  className,
}: {
  title: ReactNode
  status?: DialogStatus
  context?: ReactNode
  subtotal?: ReactNode
  subtotalTone?: 'fg' | 'accent'
  open: boolean
  onToggle: () => void
  children?: ReactNode
  /** Pie de la sección abierta: el enlace de alta a la izquierda y un dato al ras a la derecha. */
  footer?: ReactNode
  className?: string
}) {
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <div className={cn('overflow-hidden rounded-control border border-border', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-[15px] py-[13px] text-left transition-colors duration-150 hover:bg-fill-subtle"
      >
        <Chevron aria-hidden className="size-[15px] shrink-0 text-fg-muted" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-fg">{title}</span>
          {context && <StatusLine status={status}>{context}</StatusLine>}
        </span>
        {subtotal && (
          <span
            className={cn(
              'tnum shrink-0 font-display text-[15px] font-semibold',
              subtotalTone === 'accent' ? 'text-accent' : 'text-fg',
            )}
          >
            {subtotal}
          </span>
        )}
      </button>

      {open && children}

      {open && footer && (
        <div className="flex items-center justify-between gap-3 border-t border-surface-sunken px-[15px] py-[11px]">
          {footer}
        </div>
      )}
    </div>
  )
}

/** Fila dentro de una sección abierta. La separa de la de arriba una línea de la superficie
 *  hundida, no del borde: adentro de la sección el borde normal pesa demasiado. */
export function DialogSectionRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-surface-sunken px-[15px] py-[9px]', className)}>
      {children}
    </div>
  )
}

/**
 * Barra inferior de un diálogo-herramienta: rótulo y cifra en la misma línea de base que la acción
 * principal, y la salida secundaria como enlace debajo. En 480px no entran rótulo, cifra y dos
 * botones en una fila — por eso la secundaria baja.
 *
 * Va a sangre completa, así que se pasa como `footer` del `Dialog` junto con `footerBleed`.
 */
export function DialogBottomBar({
  label,
  figure,
  action,
  secondary,
}: {
  label?: ReactNode
  figure?: ReactNode
  action: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="w-full bg-surface-sunken px-6 pt-[15px] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-4">
        {(label || figure) && (
          <span className="flex shrink-0 items-baseline gap-2">
            {label && (
              <span className="text-[11px] font-semibold tracking-[0.09em] uppercase text-fg-muted">{label}</span>
            )}
            {figure}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">{action}</span>
      </div>
      {secondary && <div className="mt-2.5 text-[12px] text-fg-secondary">{secondary}</div>}
    </div>
  )
}
