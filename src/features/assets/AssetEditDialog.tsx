import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { parseAmountToCents } from '@/lib/money'
import {
  useUpdateAsset,
  useUpdateAssetManualPrice,
  type Asset,
  type AssetClass,
  type AssetQuoteCurrency,
} from '@/features/assets/api'

const assetClassOptions: { value: Exclude<AssetClass, 'fiat'>; label: string }[] = [
  { value: 'equity', label: 'Acción' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'bond', label: 'Bono' },
  { value: 'other', label: 'Otro' },
]

interface AssetEditDialogProps {
  open: boolean
  onClose: () => void
  asset: Asset
  /** Precio manual actual en centavos, en la moneda nativa del activo — `null` si nunca se cargó. */
  currentPriceCents: number | null
  /** El catálogo (nombre, clase, moneda, archivado) es sólo del admin — la base ya lo rechaza
   *  igual (`assets_update_global` exige `is_admin()`), esto evita mostrar campos que van a fallar. */
  canEditCatalog?: boolean
}

/**
 * Un solo lugar para corregir cualquier cosa de un activo: nombre, clase, moneda de cotización,
 * archivarlo, y si corresponde (no es cripto en vivo) su precio manual — antes esto último vivía
 * suelto en la lista, acá queda junto con el resto. El símbolo no se toca: varias partes del código
 * lo usan para reconocer ARS/USD, cambiarlo rompería esos casos especiales.
 */
export function AssetEditDialog({ open, onClose, asset, currentPriceCents, canEditCatalog = false }: AssetEditDialogProps) {
  const updateAsset = useUpdateAsset()
  const updatePrice = useUpdateAssetManualPrice()

  const [name, setName] = useState(asset.name)
  const [assetClass, setAssetClass] = useState<Exclude<AssetClass, 'fiat'>>(
    asset.asset_class === 'fiat' ? 'other' : asset.asset_class,
  )
  const [quoteCurrency, setQuoteCurrency] = useState<AssetQuoteCurrency>(asset.quote_currency)
  const [isArchived, setIsArchived] = useState(asset.is_archived)
  const [priceInput, setPriceInput] = useState(
    currentPriceCents != null ? (currentPriceCents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '',
  )
  const [priceError, setPriceError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(asset.name)
    setAssetClass(asset.asset_class === 'fiat' ? 'other' : asset.asset_class)
    setQuoteCurrency(asset.quote_currency)
    setIsArchived(asset.is_archived)
    setPriceInput(currentPriceCents != null ? (currentPriceCents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '')
    setPriceError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset.id])

  const isManualPrice = asset.price_source === 'manual'
  const isFiat = asset.asset_class === 'fiat'

  async function handleSave() {
    let priceCents: number | null = null
    if (isManualPrice && priceInput.trim()) {
      priceCents = parseAmountToCents(priceInput)
      if (priceCents == null || priceCents <= 0) {
        setPriceError('Cotización inválida')
        return
      }
    }

    if (canEditCatalog) {
      await updateAsset.mutateAsync({
        id: asset.id,
        name: name.trim() || asset.name,
        ...(!isFiat && { assetClass, quoteCurrency }),
        isArchived,
      })
    }

    if (priceCents != null) {
      await updatePrice.mutateAsync({ assetId: asset.id, priceCents })
    }

    onClose()
  }

  const isSaving = updateAsset.isPending || updatePrice.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Editar ${asset.symbol}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Símbolo" hint="No se puede cambiar una vez creado">
          <Input value={asset.symbol} disabled />
        </Field>

        {canEditCatalog ? (
          <Field label="Nombre" htmlFor="asset-name">
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        ) : (
          <Field label="Nombre">
            <Input value={asset.name} disabled />
          </Field>
        )}

        {canEditCatalog && !isFiat && (
          <>
            <Field label="Clase">
              <div className="flex flex-wrap gap-1.5">
                {assetClassOptions.map((c) => (
                  <Chip key={c.value} active={assetClass === c.value} onClick={() => setAssetClass(c.value)}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Se cotiza en" hint="No convierte nada de lo ya cargado, sólo cómo se interpreta el precio de acá abajo">
              <div className="flex gap-1.5">
                <Chip active={quoteCurrency === 'ARS'} onClick={() => setQuoteCurrency('ARS')}>
                  ARS
                </Chip>
                <Chip active={quoteCurrency === 'USD'} onClick={() => setQuoteCurrency('USD')}>
                  USD
                </Chip>
              </div>
            </Field>
          </>
        )}

        {isManualPrice ? (
          <Field
            label="Cotización actual"
            htmlFor="asset-price"
            hint={`${quoteCurrency} por unidad`}
            error={priceError ?? undefined}
          >
            <Input
              id="asset-price"
              inputMode="decimal"
              placeholder="0,00"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value)
                setPriceError(null)
              }}
            />
          </Field>
        ) : (
          <p className="text-[13px] text-chalk-faint">Se valúa sola en vivo (CoinGecko) — no hace falta cargarle nada.</p>
        )}

        {canEditCatalog && !isFiat && (
          <Field label="Estado">
            <div className="flex gap-1.5">
              <Chip active={!isArchived} onClick={() => setIsArchived(false)}>
                Activo
              </Chip>
              <Chip active={isArchived} onClick={() => setIsArchived(true)}>
                Archivado
              </Chip>
            </div>
          </Field>
        )}
      </div>
    </Dialog>
  )
}
