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
import { useUsdRate } from '@/features/fx/api'
import {
  useAssets,
  useAssetManualPrices,
  useCreateAsset,
  useUpdateAssetManualPrice,
  type Asset,
  type AssetClass,
  type AssetQuoteCurrency,
} from '@/features/assets/api'

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
    <Panel className="p-6">
      <p className="eyebrow">Moneda y cotización</p>
      <p className="mt-3 text-[13px] text-chalk-faint">
        Moneda principal: <span className="text-chalk">ARS</span> — es la que usa Patrimonio para mostrar el total.
      </p>

      {isPending ? (
        <Skeleton className="mt-5 h-20 w-full" />
      ) : (
        <>
          <div className="mt-5">
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
          </div>

          <div className="mt-4 flex items-end gap-2">
            <Field label="Cotización manual (ARS por USD)" hint="Se usa si elegís 'Manual', o como respaldo si la API falla" className="flex-1">
              <Input inputMode="decimal" placeholder="0,00" value={manualInput} onChange={(e) => setManualInput(e.target.value)} />
            </Field>
            <Button variant="outline" onClick={saveManualRate} disabled={updateProfile.isPending}>
              Guardar
            </Button>
          </div>

          <div className="mt-5 border-t border-ink-800 pt-4 text-[13px]">
            <p className="text-chalk-faint">Cotización en uso ahora</p>
            {usdRate.rateCents == null ? (
              <p className="mt-1 text-chalk-faint">Sin cotización disponible</p>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <Money cents={usdRate.rateCents} tone="chalk" />
                <span className="text-[12px] text-chalk-faint">
                  {usdRate.origin === 'manual' ? (usdRate.isFallback ? '· manual (la API falló)' : '· manual') : '· dolarapi.com'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  )
}

function AssetPriceRow({ asset, currentCents }: { asset: Asset; currentCents: number | null }) {
  const updatePrice = useUpdateAssetManualPrice()
  const [input, setInput] = useState(
    currentCents != null ? (currentCents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '',
  )

  async function save() {
    const cents = parseAmountToCents(input)
    if (cents == null || cents <= 0) return
    await updatePrice.mutateAsync({ assetId: asset.id, priceArsCents: cents })
  }

  return (
    <div className="flex items-end gap-2 border-t border-ink-850 py-3 first:border-t-0">
      <Field label={`${asset.symbol} — ${asset.name}`} hint="ARS por unidad" className="flex-1">
        <Input inputMode="decimal" placeholder="0,00" value={input} onChange={(e) => setInput(e.target.value)} />
      </Field>
      <Button variant="outline" size="sm" onClick={save} disabled={updatePrice.isPending}>
        Guardar
      </Button>
    </div>
  )
}

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
    <div className="mt-5 border-t border-ink-800 pt-4">
      <p className="eyebrow">Agregar activo</p>
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
        <Button variant="outline" onClick={handleCreate} disabled={createAsset.isPending}>
          {createAsset.isPending ? 'Agregando…' : 'Agregar activo'}
        </Button>
      </div>
    </div>
  )
}

function AssetsPanel() {
  const { data: assets, isPending } = useAssets()
  const { data: manualPrices } = useAssetManualPrices()

  // ARS no tiene precio (vale 1 por definición) y USD ya tiene su propio panel arriba — acá van
  // los que de verdad necesitan un número cargado a mano: acciones, bonos, activos propios.
  const manualAssets = (assets ?? []).filter((a) => a.price_source === 'manual' && a.symbol !== 'ARS' && a.symbol !== 'USD')

  return (
    <Panel className="p-6">
      <p className="eyebrow">Activos</p>
      <p className="mt-3 text-[13px] text-chalk-faint">
        Cripto se valúa sola (CoinGecko). Estos todavía no tienen cotización en vivo — cargá el precio
        actual a mano cuando quieras actualizarlo.
      </p>

      {isPending ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : manualAssets.length === 0 ? (
        <p className="mt-4 text-[13px] text-chalk-faint">Todavía no hay acciones ni bonos cargados.</p>
      ) : (
        <div className="mt-2">
          {manualAssets.map((asset) => (
            <AssetPriceRow key={asset.id} asset={asset} currentCents={manualPrices?.get(asset.id)?.priceArsCents ?? null} />
          ))}
        </div>
      )}

      <AddAssetForm />
    </Panel>
  )
}

export function Ajustes() {
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
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Ajustes</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Ajustes</h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Códigos de invitación" />
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isPending ? (
            <ul className="flex flex-col gap-1 px-6 py-5">
              {[0, 1].map((i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))}
            </ul>
          ) : !codes || codes.length === 0 ? (
            <EmptyState glyph="✉" title="Todavía no generaste ningún código" />
          ) : (
            <ul className="pb-3">
              {codes.map((code) => {
                const status = codeStatus(code)
                return (
                  <li
                    key={code.code}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850"
                  >
                    <span className="tnum font-mono text-[13px] text-chalk">{code.code}</span>
                    <span className={cn('text-[11px] font-medium', status.tone)}>{status.label}</span>
                    <span className="text-[12px] text-chalk-faint">
                      {code.usedCount}/{code.maxUses} usos
                    </span>
                    {code.expiresAt && (
                      <span className="text-[12px] text-chalk-faint">
                        vence {format(parseISO(code.expiresAt), "d 'de' MMMM", { locale: es })}
                      </span>
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
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel className="p-6">
            <p className="eyebrow">Generar código nuevo</p>
            <div className="mt-4 flex flex-col gap-4">
              <Field label="Usos permitidos">
                <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
              <Field label="Vence el" hint="Opcional">
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
              <Button onClick={handleCreate} disabled={createCode.isPending}>
                {createCode.isPending ? 'Generando…' : 'Generar código'}
              </Button>
            </div>
          </Panel>

          <FxPanel />
          <AssetsPanel />
        </div>
      </div>
    </div>
  )
}
