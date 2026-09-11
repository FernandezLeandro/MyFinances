import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface KeyValueRowProps {
  label: ReactNode
  children: ReactNode
  /** Separador arriba de esta fila puntual — para una fila que viene de otro origen que las de
   *  arriba (ver "Me deben" en la tarjeta de Ahorros de Hoy, que separa el total de deudas de las
   *  demás filas sin partir el grupo entero en dos `<dl>`). */
  divider?: boolean
  className?: string
}

/**
 * Fila "etiqueta a la izquierda, valor a la derecha" — la anatomía que se repite en `SummaryPanel`
 * (fijos/deudas por pagar, dentro de un `<dl>`) y en listas compactas como la de Ahorros en Hoy.
 * Presentacional puro: quien lo usa decide el `<dl>`/`<div>` que lo envuelve y qué va en `children`
 * (casi siempre un `<Money>`, a veces texto plano).
 */
export function KeyValueRow({ label, children, divider, className }: KeyValueRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', divider && 'border-t border-divider pt-2.5', className)}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
