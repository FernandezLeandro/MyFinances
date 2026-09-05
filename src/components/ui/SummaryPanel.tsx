import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Panel } from '@/components/ui/Panel'
import { Money, type MoneyTone } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'

export interface SummaryRow {
  label: string
  /** Importe en centavos — se enmascara junto con `hidden` y toma `tone`. Omitilo y pasá `value`
   *  para una fila que no es plata (ver "Vencidas" en Me Deben). */
  cents?: number
  tone?: MoneyTone
  /** Escape hatch para una fila cuyo valor no es un importe — se muestra tal cual, sin pasar por
   *  `hidden` ni por `<Money>`. */
  value?: ReactNode
}

interface SummaryPanelProps {
  title: string
  cents: number | undefined
  isPending?: boolean
  /** Enmascara la cifra principal y cada fila con `cents` (no las que usan `value`). */
  hidden?: boolean
  /** El `ring-1 ring-acid/15` que distingue al panel "cabecera" de un grupo de resúmenes — Hoy,
   *  Fijos, el total de Mis Deudas y el de Me Deben lo usan; el "Saldo proyectado" secundario de
   *  Mis Deudas no. */
  accent?: boolean
  rows?: SummaryRow[]
  footnote?: string
  className?: string
}

/**
 * El panel "cifra grande + desglose en `dl`" que se repetía a mano en Hoy/Fijos (como
 * `SaldoProyectadoPanel`, que hoy delega acá), Mis Deudas y Me Deben — misma anatomía, sólo cambian
 * el título, las filas y si lleva el ring de acento. Presentacional puro: no sabe nada de fijos,
 * tarjetas ni deudas, sólo de `Panel`/`Money`/`Skeleton`.
 */
export function SummaryPanel({ title, cents, isPending = false, hidden = false, accent = false, rows, footnote, className }: SummaryPanelProps) {
  return (
    <Panel className={cn('p-6', accent && 'ring-1 ring-acid/15', className)}>
      <p className="eyebrow">{title}</p>
      {isPending ? (
        <Skeleton className="mt-2 h-9 w-32" />
      ) : (
        <Money cents={cents ?? 0} tone="chalk" size="figure" className="mt-2" hidden={hidden} />
      )}

      {rows && rows.length > 0 && (
        <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-chalk-faint">{row.label}</dt>
              <dd>
                {row.value !== undefined ? row.value : <Money cents={row.cents ?? 0} tone={row.tone ?? 'dim'} hidden={hidden} />}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footnote && <p className="mt-3 text-[12px] text-chalk-faint">{footnote}</p>}
    </Panel>
  )
}
