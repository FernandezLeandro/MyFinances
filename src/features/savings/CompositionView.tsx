import { useMemo } from 'react'
import { Money } from '@/components/ui/Money'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { CategoryDonut } from '@/features/analytics/CategoryDonut'
import { valueByAsset, type AssetNet } from './aggregate'
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'

interface CompositionViewProps {
  nets: AssetNet[]
  assets: Asset[]
  prices: Map<string, AssetPrice>
}

/**
 * Donut + porcentaje por activo, igual que la composición por categoría de Análisis — se usa tanto
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
      categoryId: v.assetId,
      categoryName: assetById.get(v.assetId)?.symbol ?? '?',
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length].hex,
      cents: v.valueCents,
    }))

  return (
    // Apilado, no lado a lado: los dos lugares que usan esto (la barra lateral de Ahorros y el
    // historial de un ítem) son angostos — a diferencia del panel ancho de Análisis, un grid a dos
    // columnas quedaría apretado.
    <div className="flex flex-col gap-5">
      <CategoryDonut data={slices} />
      <ul className="flex flex-col gap-3">
        {slices.map((s) => {
          const share = total > 0 ? s.cents / total : 0
          return (
            <li key={s.categoryId} className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2 text-[14px] text-chalk">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {s.categoryName}
              </span>
              <span className="flex items-baseline gap-3">
                <span className="tnum text-[12px] text-chalk-faint">{(share * 100).toFixed(0)}%</span>
                <Money cents={s.cents} tone="dim" />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
