import { useEffect, useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { parseAmountToCents } from '@/lib/money'
import { useProfile, useUpdateProfile, type FxSource } from '@/features/profile/api'
import { useUsdRate } from '@/features/fx/api'
import { AssetCatalogList } from '@/features/assets/AssetCatalogList'
import { ChangePasswordPanel } from '@/features/auth/ChangePasswordPanel'

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
      <PanelHeader title="Moneda y cotización" hint="ARS es la moneda principal — la que usa Ahorros para el total" />

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

function AssetsPanel() {
  return (
    <Panel>
      <PanelHeader title="Activos" hint="El catálogo lo gestiona el admin — acá cargás tu propia cotización de referencia" />
      <AssetCatalogList canEditCatalog={false} excludeMainCurrencies />
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
        <ChangePasswordPanel />
      </div>
    </div>
  )
}
