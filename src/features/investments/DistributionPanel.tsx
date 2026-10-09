import { Panel } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import type { Currency } from '@/lib/money'
import { useChartColors } from '@/lib/chartColors'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import type { Share } from './aggregate'

interface DistributionPanelProps {
  title: string
  /** De mayor a menor peso, con los importes ya en la moneda de la pantalla (`byCategory`, `topWithOthers`). */
  shares: Share[]
  currency: Currency
  hidden: boolean
}

/** Un donut con su leyenda. El reparto sale del valor de hoy en USD (`weightUsdCents`); los importes
 *  de la leyenda y del tooltip, en la moneda de la pantalla. */
export function DistributionPanel({ title, shares, currency, hidden }: DistributionPanelProps) {
  const chartColors = useChartColors()
  const total = shares.reduce((sum, s) => sum + s.weightUsdCents, 0)
  const pctOf = (s: Share) => Math.round((s.weightUsdCents / total) * 100)

  return (
    <Panel className="p-panel">
      <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
      {total === 0 ? (
        <p className="mt-3 text-[13px] text-fg-muted">
          {shares.length === 0 ? 'Sin inversiones en este período.' : 'Cotización no disponible.'}
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
          <CategoryDonut
            data={shares.map((s) => ({
              categoryId: s.id,
              categoryName: s.name,
              color: s.color,
              cents: s.weightUsdCents,
              displayCents: s.valueCents ?? 0,
            }))}
            currency={currency}
            centerOverride={{ eyebrow: shares[0].name, value: `${pctOf(shares[0])}%` }}
            size={140}
          />
          <ul className="w-full min-w-0 flex-1">
            {shares.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? chartColors.fgMuted }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{s.name}</span>
                  <span className="tnum block text-[11.5px] text-fg-muted">{pctOf(s)}%</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  {s.valueCents == null ? (
                    <span className="text-[12px] text-fg-muted">Sin cotización</span>
                  ) : (
                    <Money cents={s.valueCents} currency={currency} tone="fg" size="row" hidden={hidden} />
                  )}
                  {s.gainCents != null && s.gainCents !== 0 && (
                    <Money cents={s.gainCents} currency={currency} tone={s.gainCents < 0 ? 'negative' : 'accent'} signed size="row" hidden={hidden} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
