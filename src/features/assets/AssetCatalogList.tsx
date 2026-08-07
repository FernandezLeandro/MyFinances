import { useState } from 'react'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useAssetPrices } from '@/features/fx/api'
import { useAssetManualPrices, useAssets, type Asset, type AssetClass } from '@/features/assets/api'
import { AssetEditDialog } from '@/features/assets/AssetEditDialog'

const assetClassLabels: Record<AssetClass, string> = {
  fiat: 'Moneda',
  equity: 'Acción',
  crypto: 'Cripto',
  bond: 'Bono',
  other: 'Otro',
}

function AssetRow({ asset, canEditCatalog, onEdit }: { asset: Asset; canEditCatalog: boolean; onEdit: (a: Asset) => void }) {
  const prices = useAssetPrices()
  const price = prices.get(asset.id)
  // Sin permiso de catálogo, sólo tiene sentido abrir el editor si hay un precio manual que tocar —
  // para cripto (sin precio manual) no habría nada editable adentro.
  const canEditSomething = canEditCatalog || asset.price_source === 'manual'

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850',
        asset.is_archived && 'opacity-50',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="tnum shrink-0 rounded-chip bg-ink-800 px-2 py-1 font-mono text-[12px] text-chalk">{asset.symbol}</span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-chalk">{asset.name}</p>
          <p className="text-[12px] text-chalk-faint">
            {assetClassLabels[asset.asset_class]} · cotiza en {asset.quote_currency}
            {asset.is_archived && ' · archivado'}
          </p>
        </div>
      </div>

      <div className="text-right text-[13px]">
        {asset.price_source === 'coingecko' ? (
          price?.priceArsCents != null ? (
            <span className="text-chalk-dim">
              <Money cents={price.priceArsCents} tone="dim" /> <span className="text-[11px] text-chalk-faint">en vivo</span>
            </span>
          ) : (
            <span className="text-chalk-faint">sin cotización</span>
          )
        ) : price?.priceArsCents != null ? (
          <Money cents={price.priceArsCents} tone="dim" />
        ) : (
          <span className="text-amber">sin cotización</span>
        )}
      </div>

      {canEditSomething && (
        <button
          type="button"
          onClick={() => onEdit(asset)}
          aria-label={`Editar ${asset.symbol}`}
          className="shrink-0 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </li>
  )
}

/** Puente chico: `AssetEditDialog` necesita el precio manual actual, que vive en otra query. */
function AssetEditDialogWithPrice({
  open,
  onClose,
  asset,
  canEditCatalog,
}: {
  open: boolean
  onClose: () => void
  asset: Asset
  canEditCatalog: boolean
}) {
  // Ojo: `useAssetManualPrices`, no `useAssetPrices` — este último ya devuelve el precio convertido
  // a ARS en vivo, y acá hace falta el número tal cual lo cargó esta cuenta, en la moneda nativa del
  // activo, que es lo que el campo del dialog vuelve a mostrar y a guardar.
  const { data: manualPrices } = useAssetManualPrices()
  return (
    <AssetEditDialog
      open={open}
      onClose={onClose}
      asset={asset}
      currentPriceCents={manualPrices?.get(asset.id)?.priceCents ?? null}
      canEditCatalog={canEditCatalog}
    />
  )
}

interface AssetCatalogListProps {
  /** Nombre/clase/moneda/archivado sólo los toca el admin — la base ya lo exige (`is_admin()`). */
  canEditCatalog: boolean
  /** ARS y USD tienen su propio panel de cotización en Ajustes — ahí no hace falta repetirlos. */
  excludeMainCurrencies?: boolean
}

/**
 * Lista del catálogo de activos, compartida entre Ajustes (cuenta común: sólo cargar el precio
 * propio) y el panel admin de Activos (catálogo completo). Lo que cambia entre ambos es sólo
 * `canEditCatalog` — el resto (fila, precio en vivo/manual, el dialog de edición) es lo mismo.
 */
export function AssetCatalogList({ canEditCatalog, excludeMainCurrencies = false }: AssetCatalogListProps) {
  const { data: assets, isPending } = useAssets(true)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)

  const listedAssets = excludeMainCurrencies
    ? (assets ?? []).filter((a) => a.symbol !== 'ARS' && a.symbol !== 'USD')
    : (assets ?? [])

  return (
    <>
      {isPending ? (
        <div className="px-6 pb-5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : listedAssets.length === 0 ? (
        <p className="px-6 pb-5 text-[13px] text-chalk-faint">Todavía no hay activos cargados.</p>
      ) : (
        <ul className="pb-1">
          {listedAssets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} canEditCatalog={canEditCatalog} onEdit={setEditingAsset} />
          ))}
        </ul>
      )}

      {editingAsset && (
        <AssetEditDialogWithPrice
          open={!!editingAsset}
          onClose={() => setEditingAsset(null)}
          asset={editingAsset}
          canEditCatalog={canEditCatalog}
        />
      )}
    </>
  )
}
