import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Panel, CardHeader } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { cn } from '@/lib/cn'
import { formatQuantity, type Currency } from '@/lib/money'
import type { Position, Summary } from './aggregate'

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}%`
}

/** Ganancia con flecha y %, en acento si es positiva y coral si es negativa (nunca verde/rojo). */
export function GainFigure({ cents, pct: percent, currency, hidden }: { cents: number; pct: number | null; currency: Currency; hidden?: boolean }) {
  const negative = cents < 0
  const Arrow = negative ? ArrowDownRight : ArrowUpRight
  return (
    <span className={cn('inline-flex flex-wrap items-center justify-end gap-x-1.5', negative ? 'text-negative' : 'text-accent')}>
      {cents !== 0 && <Arrow className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />}
      <Money cents={cents} currency={currency} tone={negative ? 'negative' : 'accent'} signed hidden={hidden} size="row" />
      {percent != null && <span className="tnum text-[12px]">({pct(percent)})</span>}
    </span>
  )
}

interface PositionsPanelProps {
  positions: Position[]
  summary: Summary
  /** Pesos → moneda de la pantalla (ARS/USD). */
  toDisplay: (arsCents: number | null) => number | null
  currency: Currency
  hidden: boolean
}

/** «Posiciones»: una fila por activo con la cantidad real que tenés, su valor de hoy y la ganancia. */
export function PositionsPanel({ positions, summary, toDisplay, currency, hidden }: PositionsPanelProps) {
  const totalValue = toDisplay(summary.valueCents)
  const totalGain = toDisplay(summary.gainCents)

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
          {positions.map((p) => {
            const value = toDisplay(p.valueCents)
            const unit = toDisplay(p.unitPriceCents)
            const gain = toDisplay(p.gainCents)
            return (
              <li key={p.assetId} className="flex items-start justify-between gap-4 border-t border-divider px-panel py-3.5 first:border-t-0">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-fg">
                    {p.symbol} <span className="text-[13px] font-normal text-fg-muted">{p.name}</span>
                  </p>
                  {!p.isArs && unit != null && <Money cents={unit} currency={currency} tone="dim" size="row" className="mt-0.5" hidden={hidden} />}
                  <p className="tnum mt-0.5 text-[12px] text-fg-muted">{hidden ? '••••' : `${formatQuantity(p.quantityUnits, p.decimals)} u.`}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  {value == null ? (
                    <span className="text-[13px] text-fg-muted">Sin cotización</span>
                  ) : (
                    <Money cents={value} currency={currency} tone="fg" size="figure" hidden={hidden} />
                  )}
                  {gain != null && <GainFigure cents={gain} pct={p.gainPct} currency={currency} hidden={hidden} />}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {positions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-divider px-panel py-4 text-[14px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-fg-muted">Valor total</span>
            {totalValue == null ? (
              <span className="text-fg-muted">Sin cotización</span>
            ) : (
              <Money cents={totalValue} currency={currency} tone="fg" size="figure" hidden={hidden} />
            )}
          </div>
          {totalGain != null && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-fg-muted">Ganancia</span>
              <GainFigure cents={totalGain} pct={summary.gainPct} currency={currency} hidden={hidden} />
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
