import { useMemo } from 'react'
import { Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { valueByAsset, type AssetNet } from './aggregate'
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'

interface CompositionViewProps {
  nets: AssetNet[]
  assets: Asset[]
  prices: Map<string, AssetPrice>
}

/**
 * Barra apilada + porcentaje por activo — igual criterio que "Flujo del mes" en Hoy. Se usa tanto
 * para el total de ahorros como para un ítem individual, sólo cambian los `nets` que se le pasan.
 * Muestra el % del VALOR (lo que vale hoy en ARS), no la cantidad de unidades — eso ya se ve en la
 * tarjeta de cada ítem.
 */
export function CompositionView({ nets, assets, prices }: CompositionViewProps) {
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const values = valueByAsset(nets, assets, prices)

  if (values == null) {
    return <p className="text-[13px] text-chalk-faint">Cotización no disponible para calcular la composición.</p>
  }
  if (values.length === 0) {
    return <p className="text-[13px] text-chalk-faint">Sin aportes todavía.</p>
  }

  const total = values.reduce((sum, v) => sum + v.valueCents, 0)
  const slices = values
    .slice()
    .sort((a, b) => b.valueCents - a.valueCents)
    .map((v, i) => ({
      assetId: v.assetId,
      name: assetById.get(v.assetId)?.symbol ?? '?',
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length].hex,
      cents: v.valueCents,
      pct: total > 0 ? (v.valueCents / total) * 100 : 0,
    }))

  return (
    <div className="flex flex-col gap-4">
      <StackedBar segments={slices.map((s) => ({ pct: s.pct, color: s.color }))} />
      <ul className="flex flex-col gap-3">
        {slices.map((s) => (
          <li key={s.assetId} className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-2 text-[14px] text-chalk">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tnum text-[12px] text-chalk-faint">{Math.round(s.pct)}%</span>
              <Money cents={s.cents} tone="dim" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
