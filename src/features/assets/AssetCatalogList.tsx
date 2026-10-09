import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useAssetPrices, useDollarQuotes, type AssetPrice } from '@/features/fx/api'
import { dollarLabel, type ResolvedQuote } from '@/features/fx/quotes'
import { useAssets, useDeleteAsset, type Asset, type AssetClass } from '@/features/assets/api'
import { AssetEditDialog } from '@/features/assets/AssetEditDialog'

const assetClassLabels: Record<AssetClass, string> = {
  fiat: 'Moneda',
  equity: 'Acción',
  crypto: 'Cripto',
  bond: 'Bono',
  other: 'Otro',
}

const usdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 })

function AssetRow({
  asset,
  price,
  quote,
  onEdit,
}: {
  asset: Asset
  price: AssetPrice | undefined
  /** Cotización del dólar con el que se convierte este activo — para mostrar el equivalente en pesos. */
  quote: ResolvedQuote | undefined
  onEdit: (a: Asset) => void
}) {
  const deleteAsset = useDeleteAsset()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // ARS/USD son la base del resto de la conversión de moneda en toda la app — no se pueden borrar.
  const canDelete = asset.asset_class !== 'fiat'
  const priceUsd = price?.priceUsd ?? null

  function handleConfirmDelete() {
    // Si falla (típicamente por el FK de investments), el MutationCache global ya muestra el
    // toast con el mensaje de "está en uso, archivalo" — acá sólo cerramos el diálogo si salió bien.
    deleteAsset.mutate(asset.id, { onSuccess: () => setConfirmingDelete(false) })
  }

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1.5 px-panel py-3.5 transition-colors duration-150 hover:bg-fill-subtle',
        asset.is_archived && 'opacity-50',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="tnum shrink-0 rounded-chip bg-fill-subtle px-2 py-1 font-mono text-[12px] text-fg">{asset.symbol}</span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-fg">{asset.name}</p>
          <p className="text-[12px] text-fg-muted">
            {assetClassLabels[asset.asset_class]}
            {asset.asset_class !== 'fiat' && ` · se convierte con ${dollarLabel(asset.fx_source)}`}
            {asset.is_archived && ' · archivado'}
          </p>
        </div>
      </div>

      {asset.asset_class !== 'fiat' && (
        <div className="text-right text-[13px]">
          {priceUsd == null ? (
            asset.price_source === 'coingecko' ? (
              <span className="text-fg-muted">sin cotización</span>
            ) : (
              <Badge variant="amber">Sin precio</Badge>
            )
          ) : (
            <>
              <p className="tnum text-fg-secondary">
                {usdFormat.format(priceUsd)}
                {asset.price_source === 'coingecko' && <span className="ml-1 text-[11px] text-fg-muted">en vivo</span>}
              </p>
              {quote && (
                <p className="text-[11.5px] text-fg-muted">
                  ≈ <Money cents={Math.round(priceUsd * quote.buyCents)} tone="dim" size="row" className="inline" />
                </p>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onEdit(asset)}
        aria-label={`Editar ${asset.symbol}`}
        className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
      >
        <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
      </button>

      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteAsset.isPending}
          aria-label={`Eliminar ${asset.symbol}`}
          className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
        >
          <Trash2 className="size-4" strokeWidth={1.3} aria-hidden />
        </button>
      )}

      {confirmingDelete && (
        <Dialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title="Eliminar activo"
          footer={
            <>
              <Button variant="ghost" size="dialogFooter" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button variant="danger" size="dialogFooter" onClick={handleConfirmDelete} disabled={deleteAsset.isPending}>
                {deleteAsset.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-fg-secondary">
            ¿Eliminar <span className="text-fg">{asset.symbol}</span> ({asset.name}) del catálogo? No se puede deshacer.
          </p>
        </Dialog>
      )}
    </li>
  )
}

/**
 * Catálogo de activos del admin (`/admin/activos`): nombre, clase, precio en USD, el dólar con el que
 * se convierte a pesos y el equivalente en pesos de hoy. El precio es el mismo para todas las cuentas.
 */
export function AssetCatalogList() {
  const { data: assets, isPending } = useAssets(true)
  // Una sola vez acá arriba, no por fila.
  const prices = useAssetPrices()
  const { quotes } = useDollarQuotes()
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)

  return (
    <>
      {isPending ? (
        <div className="px-panel pb-5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (assets ?? []).length === 0 ? (
        <p className="px-panel pb-5 text-[13px] text-fg-muted">Todavía no hay activos cargados.</p>
      ) : (
        <ul className="pb-1">
          {(assets ?? []).map((asset) => (
            <AssetRow key={asset.id} asset={asset} price={prices.get(asset.id)} quote={quotes.get(asset.fx_source)} onEdit={setEditingAsset} />
          ))}
        </ul>
      )}

      {editingAsset && <AssetEditDialog open={!!editingAsset} onClose={() => setEditingAsset(null)} asset={editingAsset} />}
    </>
  )
}
