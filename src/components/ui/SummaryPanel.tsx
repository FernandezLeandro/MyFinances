import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Panel } from '@/components/ui/Panel'
import { KeyValueRow } from '@/components/ui/KeyValueRow'
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
  /** El `ring-1 ring-accent/15` que distingue al panel "cabecera" de un grupo de resúmenes — el total
   *  de Mis Deudas y el de Me Deben lo usan; el "Saldo proyectado" secundario de Mis Deudas no. Sin
   *  efecto si `inverse` está activo (esa tarjeta ya se distingue por el fondo, no por un ring). */
  accent?: boolean
  /** Tarjeta oscura fija — `SaldoProyectadoPanel` (Hoy y Fijos) la usa siempre. Cambia la cifra y
   *  las filas a los tonos "on-inverse", sin importar el tema de la app (ver `Panel` tone="inverse"). */
  inverse?: boolean
  rows?: SummaryRow[]
  footnote?: string
  className?: string
}

/**
 * El panel "cifra grande + desglose" que se repetía a mano en Hoy/Fijos (como `SaldoProyectadoPanel`,
 * que hoy delega acá), Mis Deudas y Me Deben — misma anatomía, sólo cambian el título, las filas y
 * si lleva el ring de acento o el fondo invertido. Presentacional puro: no sabe nada de fijos,
 * tarjetas ni deudas, sólo de `Panel`/`KeyValueRow`/`Money`/`Skeleton`.
 */
export function SummaryPanel({
  title,
  cents,
  isPending = false,
  hidden = false,
  accent = false,
  inverse = false,
  rows,
  footnote,
  className,
}: SummaryPanelProps) {
  const labelClass = inverse ? 'text-on-inverse-secondary' : 'text-fg-secondary'

  return (
    <Panel
      tone={inverse ? 'inverse' : 'raised'}
      className={cn(
        'flex flex-col p-6',
        inverse && 'justify-between',
        !inverse && accent && 'ring-1 ring-accent/15',
        className,
      )}
    >
      <p className="eyebrow" style={inverse ? { color: 'var(--color-on-inverse-muted)' } : undefined}>
        {title}
      </p>
      {isPending ? (
        <Skeleton className="mt-2 h-9 w-32" />
      ) : (
        <Money cents={cents ?? 0} tone={inverse ? 'onInverse' : 'fg'} size="figure" className="mt-2" hidden={hidden} />
      )}

      {rows && rows.length > 0 && (
        <dl
          className={cn('mt-5 space-y-2 border-t pt-4 text-[13px]', inverse ? 'border-inverse-divider' : 'border-divider')}
        >
          {rows.map((row) => (
            <KeyValueRow key={row.label} label={<span className={labelClass}>{row.label}</span>}>
              {row.value !== undefined ? (
                row.value
              ) : (
                <Money cents={row.cents ?? 0} tone={row.tone ?? (inverse ? 'onInverseSecondary' : 'dim')} hidden={hidden} />
              )}
            </KeyValueRow>
          ))}
        </dl>
      )}

      {footnote && (
        <p className={cn('mt-3 text-[12px]', inverse ? 'text-on-inverse-muted' : 'text-fg-muted')}>{footnote}</p>
      )}
    </Panel>
  )
}
