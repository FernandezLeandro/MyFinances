import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import { formatQuantity, type Currency } from '@/lib/money'
import type { Position, Summary } from './aggregate'

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`
}

interface GainFigureProps {
  cents: number
  pct: number | null
  currency: Currency
  hidden?: boolean
  /** `figure` = el mismo tamaño que «Invertido» en el resumen; `row` (default) para filas y totales. */
  size?: 'row' | 'figure'
}

/** Ganancia con flecha y %, en acento si es positiva y coral si es negativa (nunca verde/rojo). */
export function GainFigure({ cents, pct: percent, currency, hidden, size = 'row' }: GainFigureProps) {
  const negative = cents < 0
  const Arrow = negative ? ArrowDownRight : ArrowUpRight
  const big = size === 'figure'
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5', big ? 'gap-y-0.5' : 'justify-end', negative ? 'text-negative' : 'text-accent')}>
      {cents !== 0 && <Arrow className={cn('shrink-0', big ? 'size-5' : 'size-3.5')} strokeWidth={2} aria-hidden />}
      <Money cents={cents} currency={currency} tone={negative ? 'negative' : 'accent'} signed hidden={hidden} size={size} />
      {percent != null && <span className={cn('tnum', big ? 'text-[14px] font-semibold' : 'text-[12px]')}>({pct(percent)})</span>}
    </span>
  )
}

interface PositionsPanelProps {
  /** Ya en la moneda de la pantalla (`positionsByAsset(…, currency)`). */
  positions: Position[]
  summary: Summary
  currency: Currency
  hidden: boolean
}

/** «Posiciones»: una fila por activo con la cantidad real que tenés, lo que pusiste, su valor de hoy y la ganancia. */
export function PositionsPanel({ positions, summary, currency, hidden }: PositionsPanelProps) {
  return (
    <Panel>
      <CardHeader
        title="Posiciones"
        action={<span className="rounded-pill bg-fill-subtle px-2.5 py-1 text-[11.5px] font-semibold text-fg-muted">{positions.length}</span>}
      />
      {positions.length === 0 ? (
        <p className="px-panel pt-2 pb-5 text-[13px] text-fg-muted">Sin inversiones en este período.</p>
      ) : (
        <ul className="pt-1">
          {positions.map((p) => (
            <li key={p.assetId} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-t border-divider px-panel py-3.5 first:border-t-0">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-fg">
                  {p.symbol} <span className="text-[13px] font-normal text-fg-muted">{p.name}</span>
                </p>
                {!p.isArs && p.unitPriceCents != null && (
                  <Money cents={p.unitPriceCents} currency={currency} tone="dim" size="row" className="mt-0.5" hidden={hidden} />
                )}
                <p className="tnum mt-0.5 text-[12px] text-fg-muted">{hidden ? '••••' : `${formatQuantity(p.quantityUnits, p.decimals)} u.`}</p>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-x-8 gap-y-2 text-right">
                {!p.isArs && p.costCents != null && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Invertido</span>
                    <Money cents={p.costCents} currency={currency} tone="dim" size="row" hidden={hidden} />
                  </div>
                )}
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Valor actual</span>
                  {p.valueCents == null ? (
                    <span className="text-[13px] text-fg-muted">Sin cotización</span>
                  ) : (
                    <Money cents={p.valueCents} currency={currency} tone="fg" size="figure" hidden={hidden} />
                  )}
                  {p.gainCents != null && <GainFigure cents={p.gainCents} pct={p.gainPct} currency={currency} hidden={hidden} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {positions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-divider px-panel py-4 text-[14px]">
          {summary.investedCents != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-fg-muted">Invertido</span>
              <Money cents={summary.investedCents} currency={currency} tone="dim" size="figure" hidden={hidden} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <span className="text-fg-muted">Valor total</span>
            {summary.valueCents == null ? (
              <span className="text-fg-muted">Sin cotización</span>
            ) : (
              <Money cents={summary.valueCents} currency={currency} tone="fg" size="figure" hidden={hidden} />
            )}
          </div>
          {summary.gainCents != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-fg-muted">Ganancia</span>
              <GainFigure cents={summary.gainCents} pct={summary.gainPct} currency={currency} hidden={hidden} />
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
