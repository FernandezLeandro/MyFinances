import { cn } from '@/lib/cn'
import { formatQuantity } from '@/lib/money'
import { Money } from '@/components/ui/Money'
import type { Asset } from '@/features/assets/api'
import type { AssetNet } from '@/features/savings/aggregate'

/**
 * Cantidad neta de un activo, tipografiada según corresponda: `Money` para ARS, cantidad + símbolo
 * para el resto. Compartido por Ahorros (lista completa de un ítem) y la tarjeta teaser de Ahorros
 * en Hoy (una línea por ítem) — antes vivía sólo en `Ahorros.tsx`.
 */
export function NetAmount({
  net,
  asset,
  tone = 'dim',
  hidden = false,
}: {
  net: AssetNet
  asset: Asset
  tone?: 'dim' | 'fg' | 'negative' | 'accent'
  hidden?: boolean
}) {
  if (asset.symbol === 'ARS') return <Money cents={net.quantityUnits} tone={tone} hidden={hidden} />
  if (hidden) {
    return <span className={cn('tnum text-[14px]', tone === 'dim' ? 'text-fg-secondary' : 'text-fg')}>•••• {asset.symbol}</span>
  }
  return (
    <span className={cn('tnum text-[14px]', tone === 'dim' ? 'text-fg-secondary' : 'text-fg')}>
      {formatQuantity(net.quantityUnits, asset.decimals)} {asset.symbol}
    </span>
  )
}
