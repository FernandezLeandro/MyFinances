import { useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { AssetCatalogList } from '@/features/assets/AssetCatalogList'
import { useCreateAsset, type AssetClass, type AssetQuoteCurrency } from '@/features/assets/api'

const assetClassOptions: { value: Exclude<AssetClass, 'fiat'>; label: string }[] = [
  { value: 'equity', label: 'Acción' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'bond', label: 'Bono' },
  { value: 'other', label: 'Otro' },
]

function AddAssetForm() {
  const createAsset = useCreateAsset()
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [assetClass, setAssetClass] = useState<Exclude<AssetClass, 'fiat'>>('equity')
  const [quoteCurrency, setQuoteCurrency] = useState<AssetQuoteCurrency>('USD')

  async function handleCreate() {
    if (!symbol.trim() || !name.trim()) return
    await createAsset.mutateAsync({ symbol, name, assetClass, quoteCurrency })
    setSymbol('')
    setName('')
  }

  return (
    <div className="border-t border-ink-800 p-6">
      <p className="eyebrow">Agregar activo</p>
      <p className="mt-1.5 text-[12px] text-chalk-faint">Queda visible para todas las cuentas.</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Símbolo">
            <Input placeholder="VOO, AL30…" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </Field>
          <Field label="Nombre">
            <Input placeholder="Vanguard S&P 500" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {assetClassOptions.map((c) => (
            <Chip key={c.value} active={assetClass === c.value} onClick={() => setAssetClass(c.value)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Chip active={quoteCurrency === 'ARS'} onClick={() => setQuoteCurrency('ARS')}>
            Se cotiza en ARS
          </Chip>
          <Chip active={quoteCurrency === 'USD'} onClick={() => setQuoteCurrency('USD')}>
            Se cotiza en USD
          </Chip>
        </div>
        <Button variant="outline" onClick={handleCreate} disabled={createAsset.isPending} className="self-start">
          {createAsset.isPending ? 'Agregando…' : 'Agregar activo'}
        </Button>
      </div>
    </div>
  )
}

export function Activos() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Activos</h1>
        <p className="mt-2 max-w-md text-[13px] text-chalk-faint">
          El catálogo completo de Ahorros: nombre, clase y moneda de cotización. Cada cuenta sigue cargando su propio precio de referencia por separado.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Catálogo" hint="Cripto se valúa sola vía CoinGecko — el resto necesita un precio cargado a mano por cuenta" />
        <AssetCatalogList canEditCatalog />
        <AddAssetForm />
      </Panel>
    </div>
  )
}
