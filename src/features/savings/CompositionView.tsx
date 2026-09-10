import { Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { assetSlices, type AssetNet } from './aggregate'
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
  const slices = assetSlices(nets, assets, prices)

  if (slices == null) {
    return <p className="text-[13px] text-fg-muted">Cotización no disponible para calcular la composición.</p>
  }
  if (slices.length === 0) {
    return <p className="text-[13px] text-fg-muted">Sin aportes todavía.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <StackedBar segments={slices.map((s) => ({ pct: s.pct, color: s.color }))} />
      <ul className="flex flex-col gap-3">
        {slices.map((s) => (
          <li key={s.assetId} className="flex items-baseline justify-between gap-4">
            <span className="flex items-center gap-2 text-[14px] text-fg">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
            <span className="flex items-baseline gap-3">
              <span className="tnum text-[12px] text-fg-muted">{Math.round(s.pct)}%</span>
              <Money cents={s.cents} tone="dim" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
