import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { parseAmountToCents } from '@/lib/money'
import {
  useCreateInviteCode,
  useDeactivateInviteCode,
  useMyInviteCodes,
  type InviteCode,
} from '@/features/invites/api'
import { useProfile, useUpdateProfile, type FxSource } from '@/features/profile/api'
import { useAssetPrices, useUsdRate } from '@/features/fx/api'
import {
  useAssetManualPrices,
  useAssets,
  useCreateAsset,
  type Asset,
  type AssetClass,
  type AssetQuoteCurrency,
} from '@/features/assets/api'
import { AssetEditDialog } from '@/features/assets/AssetEditDialog'

function codeStatus(code: InviteCode) {
  if (!code.isActive) return { label: 'Revocado', tone: 'text-chalk-faint' }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return { label: 'Vencido', tone: 'text-coral' }
  if (code.usedCount >= code.maxUses) return { label: 'Agotado', tone: 'text-coral' }
  return { label: 'Activo', tone: 'text-acid' }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

const fxSources: { value: FxSource; label: string }[] = [
  { value: 'oficial', label: 'Oficial' },
  { value: 'blue', label: 'Blue' },
  { value: 'bolsa', label: 'MEP' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'manual', label: 'Manual' },
]

function FxPanel() {
  const { data: profile, isPending } = useProfile()
  const updateProfile = useUpdateProfile()
  const usdRate = useUsdRate()
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    if (profile?.usdRateManualCents != null) {
      setManualInput((profile.usdRateManualCents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }))
    }
  }, [profile?.usdRateManualCents])

  async function saveManualRate() {
    const cents = parseAmountToCents(manualInput)
    if (cents == null || cents <= 0) return
    await updateProfile.mutateAsync({ usdRateManualCents: cents })
  }

  return (
    <Panel>
      <PanelHeader title="Moneda y cotización" hint="ARS es la moneda principal — la que usa Patrimonio para el total" />

      {isPending ? (
        <div className="px-6 pb-6">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 px-6 pb-6 sm:grid-cols-2">
          <div>
            <p className="eyebrow">Fuente del dólar</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fxSources.map((s) => (
                <Chip
                  key={s.value}
                  active={profile?.fxSource === s.value}
                  onClick={() => updateProfile.mutate({ fxSource: s.value })}
                >
                  {s.label}
                </Chip>
              ))}
            </div>

            <div className="mt-5 text-[13px]">
              <p className="text-chalk-faint">Cotización en uso ahora</p>
              {usdRate.rateCents == null ? (
                <p className="mt-1 text-chalk-faint">Sin cotización disponible</p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <Money cents={usdRate.rateCents} tone="chalk" size="figure" />
                  <span className="text-[12px] text-chalk-faint">
                    {usdRate.origin === 'manual' ? (usdRate.isFallback ? '· manual (la API falló)' : '· manual') : '· dolarapi.com'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <Field label="Cotización manual (ARS por USD)" hint="Se usa si elegís 'Manual', o como respaldo si la API falla">
              <Input inputMode="decimal" placeholder="0,00" value={manualInput} onChange={(e) => setManualInput(e.target.value)} />
            </Field>
            <Button variant="outline" onClick={saveManualRate} disabled={updateProfile.isPending} className="self-start">
              Guardar
            </Button>
          </div>
        </div>
      )}
    </Panel>
  )
}

const assetClassOptions: { value: Exclude<AssetClass, 'fiat'>; label: string }[] = [
  { value: 'equity', label: 'Acción' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'bond', label: 'Bono' },
  { value: 'other', label: 'Otro' },
]

const assetClassLabels: Record<AssetClass, string> = {
  fiat: 'Moneda',
  equity: 'Acción',
  crypto: 'Cripto',
  bond: 'Bono',
  other: 'Otro',
}

function AssetRow({ asset, onEdit }: { asset: Asset; onEdit: (a: Asset) => void }) {
  const prices = useAssetPrices()
  const price = prices.get(asset.id)

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
    </li>
  )
}

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
      <p className="mt-1.5 text-[12px] text-chalk-faint">Queda visible para todas las cuentas, no sólo la tuya.</p>
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

function AssetsPanel() {
  const { data: assets, isPending } = useAssets(true)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)

  // ARS y USD tienen su propio tratamiento en "Moneda y cotización" (arriba) — acá va el resto del
  // catálogo: cripto (se valúa sola), acciones, bonos y lo que cada cuenta haya agregado.
  const listedAssets = (assets ?? []).filter((a) => a.symbol !== 'ARS' && a.symbol !== 'USD')

  return (
    <Panel>
      <PanelHeader title="Activos" hint="Cripto se valúa sola vía CoinGecko — el resto necesita un precio cargado a mano" />

      {isPending ? (
        <div className="px-6 pb-5">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : listedAssets.length === 0 ? (
        <p className="px-6 pb-5 text-[13px] text-chalk-faint">Todavía no hay activos más allá de ARS y USD.</p>
      ) : (
        <ul className="pb-1">
          {listedAssets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} onEdit={setEditingAsset} />
          ))}
        </ul>
      )}

      <AddAssetForm />

      {editingAsset && (
        <AssetEditDialogWithPrice open={!!editingAsset} onClose={() => setEditingAsset(null)} asset={editingAsset} />
      )}
    </Panel>
  )
}

/** Puente chico: `AssetEditDialog` necesita el precio manual actual, que vive en otra query. */
function AssetEditDialogWithPrice({ open, onClose, asset }: { open: boolean; onClose: () => void; asset: Asset }) {
  // Ojo: `useAssetManualPrices`, no `useAssetPrices` — este último ya devuelve el precio convertido
  // a ARS en vivo, y acá hace falta el número tal cual lo cargó esta cuenta, en la moneda nativa del
  // activo (USD para una acción), que es lo que el campo del dialog vuelve a mostrar y a guardar.
  const { data: manualPrices } = useAssetManualPrices()
  return (
    <AssetEditDialog
      open={open}
      onClose={onClose}
      asset={asset}
      currentPriceCents={manualPrices?.get(asset.id)?.priceCents ?? null}
    />
  )
}

function InvitesPanel() {
  const { data: codes, isPending, isError, refetch } = useMyInviteCodes()
  const createCode = useCreateInviteCode()
  const deactivateCode = useDeactivateInviteCode()

  const [maxUses, setMaxUses] = useState('1')
  const [expiresAt, setExpiresAt] = useState('')

  async function handleCreate() {
    const uses = Number(maxUses)
    if (!Number.isInteger(uses) || uses < 1) return
    await createCode.mutateAsync({
      maxUses: uses,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    setMaxUses('1')
    setExpiresAt('')
  }

  return (
    <Panel>
      <PanelHeader title="Invitaciones" />

      <div className="px-6 pb-6">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="flex flex-col gap-1">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : !codes || codes.length === 0 ? (
          <EmptyState glyph="✉" title="Todavía no generaste ningún código" />
        ) : (
          <ul>
            {codes.map((code) => {
              const status = codeStatus(code)
              return (
                <li
                  key={code.code}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-850 py-2.5 text-[13px] first:border-t-0"
                >
                  <span className="tnum font-mono text-chalk">{code.code}</span>
                  <span className={cn('text-[11px] font-medium', status.tone)}>{status.label}</span>
                  <span className="text-[12px] text-chalk-faint">
                    {code.usedCount}/{code.maxUses}
                  </span>
                  {code.expiresAt && (
                    <span className="text-[12px] text-chalk-faint">{format(parseISO(code.expiresAt), "d/MM", { locale: es })}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <CopyButton text={code.code} />
                    {status.label === 'Activo' && (
                      <button
                        type="button"
                        onClick={() => deactivateCode.mutate(code.code)}
                        className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
                      >
                        Revocar
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-ink-800 pt-4">
          <p className="eyebrow">Generar código nuevo</p>
          <div className="mt-3 flex items-end gap-2">
            <Field label="Usos" className="w-20">
              <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </Field>
            <Field label="Vence el" hint="Opcional" className="flex-1">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
            <Button variant="outline" onClick={handleCreate} disabled={createCode.isPending}>
              {createCode.isPending ? 'Generando…' : 'Generar'}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function Ajustes() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Ajustes</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Ajustes</h1>
      </header>

      <div className="flex flex-col gap-6">
        <FxPanel />
        <AssetsPanel />
        <InvitesPanel />
      </div>
    </div>
  )
}
