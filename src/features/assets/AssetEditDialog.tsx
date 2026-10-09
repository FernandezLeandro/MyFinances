import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { parseQuantity } from '@/lib/money'
import { DOLLAR_TYPES, type DollarType } from '@/features/fx/quotes'
import { useUpdateAsset, type Asset, type AssetClass } from '@/features/assets/api'

const assetClassOptions: { value: Exclude<AssetClass, 'fiat'>; label: string }[] = [
  { value: 'equity', label: 'Acción' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'bond', label: 'Bono' },
  { value: 'other', label: 'Otro' },
]

/** Precio por unidad con hasta 8 decimales (una acción cotiza en 2; una cripto barata, en más). */
function priceToInputText(price: string | null): string {
  if (price == null) return ''
  return Number(price).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
}

interface AssetEditDialogProps {
  open: boolean
  onClose: () => void
  asset: Asset
}

/**
 * Un solo lugar para corregir un activo del catálogo (sólo admin): nombre, clase, precio en USD,
 * el dólar con el que se convierte a pesos y archivarlo. El símbolo no se toca: varias partes del
 * código lo usan para reconocer ARS/USD. El precio sólo se carga si el activo no trae uno en vivo
 * (cripto se valúa sola con CoinGecko).
 */
export function AssetEditDialog({ open, onClose, asset }: AssetEditDialogProps) {
  const updateAsset = useUpdateAsset()
  const isFiat = asset.asset_class === 'fiat'
  const hasLivePrice = asset.price_source === 'coingecko'

  const [name, setName] = useState(asset.name)
  const [assetClass, setAssetClass] = useState<Exclude<AssetClass, 'fiat'>>(asset.asset_class === 'fiat' ? 'other' : asset.asset_class)
  const [fxSource, setFxSource] = useState<DollarType>(asset.fx_source)
  const [isArchived, setIsArchived] = useState(asset.is_archived)
  const [priceInput, setPriceInput] = useState(priceToInputText(asset.price_usd))
  const [priceError, setPriceError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(asset.name)
    setAssetClass(asset.asset_class === 'fiat' ? 'other' : asset.asset_class)
    setFxSource(asset.fx_source)
    setIsArchived(asset.is_archived)
    setPriceInput(priceToInputText(asset.price_usd))
    setPriceError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset.id])

  function handleSave() {
    let priceUsd: number | null | undefined
    if (!isFiat && !hasLivePrice) {
      if (priceInput.trim()) {
        const units = parseQuantity(priceInput, 8)
        if (units == null || units <= 0) {
          setPriceError('Precio inválido')
          return
        }
        priceUsd = units / 1e8
      } else {
        priceUsd = null
      }
    }

    updateAsset.mutate(
      {
        id: asset.id,
        name: name.trim() || asset.name,
        ...(!isFiat && { assetClass, fxSource, isArchived }),
        ...(priceUsd !== undefined && priceUsd !== (asset.price_usd == null ? null : Number(asset.price_usd)) && { priceUsd }),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Editar ${asset.symbol}`}
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleSave} disabled={updateAsset.isPending}>
            {updateAsset.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Símbolo" hint="No se puede cambiar una vez creado">
          <Input value={asset.symbol} disabled />
        </Field>

        <Field label="Nombre" htmlFor="asset-name">
          <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        {!isFiat && (
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

            {hasLivePrice ? (
              <p className="text-[13px] text-fg-muted">El precio en USD se actualiza solo en vivo (CoinGecko) — no hace falta cargarlo.</p>
            ) : (
              <Field label="Precio en USD" htmlFor="asset-price" hint="USD por unidad. Es el mismo para todas las cuentas" error={priceError ?? undefined}>
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
            )}

            <Field label="Dólar para convertir" hint="Con este dólar se pasa el precio a pesos al valuar">
              <div className="flex flex-wrap gap-1.5">
                {DOLLAR_TYPES.map((d) => (
                  <Chip key={d.value} active={fxSource === d.value} onClick={() => setFxSource(d.value)}>
                    {d.label}
                  </Chip>
                ))}
              </div>
            </Field>

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
          </>
        )}
      </div>
    </Dialog>
  )
}
