import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { format, parseISO } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { cn } from '@/lib/cn'
import { parseAmountToCents, sanitizeAmountInput } from '@/lib/money'
import { useProfile, useUpdateProfile, type CycleKind, type FxSource } from '@/features/profile/api'
import { useUsdRate, useAssetPrices } from '@/features/fx/api'
import { useAssets } from '@/features/assets/api'
import { AssetCatalogList } from '@/features/assets/AssetCatalogList'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordPanel'
import { useBalanceLocations } from '@/features/accounts/api'
import { accountKindIcon } from '@/features/accounts/accountKind'
import { useCategories } from '@/features/categories/api'
import { useTheme } from '@/lib/useTheme'
import { supabase } from '@/lib/supabase'
import { useCan } from '@/features/access/useCan'

const fxSources: { value: FxSource; label: string }[] = [
  { value: 'oficial', label: 'Oficial' },
  { value: 'blue', label: 'Blue' },
  { value: 'bolsa', label: 'MEP' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'manual', label: 'Manual' },
]

/** La tarjeta oscura que manda en la columna izquierda — misma superficie invertida que el saldo de
 *  Hoy y los fijos proyectados: acá marca que esta cifra gobierna al resto de la app (Ahorros,
 *  activos, cualquier cifra en dólares). Los chips y el campo manual usan `inverse-divider` como
 *  fondo/separador — el mismo token que ya usa `SaldoProyectadoPanel` para la barra de comprometido. */
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

  const sourceLabel = fxSources.find((s) => s.value === profile?.fxSource)?.label
  const originLabel = usdRate.origin === 'manual' ? (usdRate.isFallback ? 'manual (la API falló)' : 'manual') : 'dolarapi.com'
  const timeLabel = usdRate.updatedAt ? format(parseISO(usdRate.updatedAt), 'HH:mm') : null

  return (
    <Panel tone="inverse" className="p-panel">
      {isPending ? (
        <Skeleton className="h-28 w-full bg-inverse-divider" />
      ) : (
        <>
          <p className="text-[11.5px] font-semibold tracking-[0.12em] text-on-inverse-muted uppercase">Dólar en uso</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
            {usdRate.rateCents == null ? (
              <span className="font-display text-[32px] font-bold text-on-inverse">Sin cotización</span>
            ) : (
              <Money cents={usdRate.rateCents} tone="onInverse" size="display" />
            )}
            {usdRate.rateCents != null && (
              <span className="text-[13px] text-on-inverse-muted">
                {sourceLabel} · {originLabel}
                {timeLabel ? ` · ${timeLabel}` : ''}
              </span>
            )}
          </div>
          <p className="mt-3 max-w-[420px] text-[12.5px] leading-relaxed text-on-inverse-muted">
            Con esta cotización se convierte todo lo que no está en pesos: el total de Ahorros, los activos y las cifras en dólares de cada
            pantalla.
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-6 border-t border-inverse-divider pt-4.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold tracking-[0.09em] text-on-inverse-muted uppercase">Fuente</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fxSources.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => updateProfile.mutate({ fxSource: s.value })}
                    className={cn(
                      'rounded-chip px-[13px] py-[7px] text-[12.5px] transition-colors duration-150',
                      profile?.fxSource === s.value
                        ? 'bg-on-inverse font-semibold text-inverse'
                        : 'bg-inverse-divider text-on-inverse-secondary hover:text-on-inverse',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-[230px] shrink-0">
              <p className="text-[10.5px] font-semibold tracking-[0.09em] text-on-inverse-muted uppercase">Manual, de respaldo</p>
              <div className="mt-2 flex gap-2">
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={manualInput}
                  onChange={(e) => setManualInput(sanitizeAmountInput(e.target.value))}
                  className="tnum h-10 min-w-0 flex-1 rounded-control bg-inverse-divider px-3 text-[14px] text-on-inverse outline-none"
                />
                <button
                  type="button"
                  onClick={saveManualRate}
                  disabled={updateProfile.isPending}
                  className="shrink-0 rounded-control border border-inverse-divider px-3.5 text-[13px] font-semibold text-on-inverse transition-colors duration-150 hover:bg-inverse-divider"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}

function AssetsPanel() {
  const { data: assets } = useAssets()
  const prices = useAssetPrices()
  const missingCount = (assets ?? []).filter(
    (a) => a.symbol !== 'ARS' && a.symbol !== 'USD' && prices.get(a.id)?.priceArsCents == null,
  ).length

  return (
    <Panel>
      <PanelHeader
        title="Activos"
        hint="El catálogo lo gestiona el admin — acá cargás tu propia cotización de referencia"
        action={
          missingCount > 0 ? (
            <span className="shrink-0 rounded-pill bg-badge-amber-bg px-[11px] py-[5px] text-[11.5px] font-semibold text-badge-amber-fg">
              {missingCount} sin cotización
            </span>
          ) : undefined
        }
      />
      <AssetCatalogList canEditCatalog={false} excludeMainCurrencies />
    </Panel>
  )
}

/** Sin la cifra y sin "Transferir" (27a) — esos compiten con la tarjeta del dólar, la única cifra
 *  que esta pantalla destaca. Mismo patrón que `CategoriesPanel`: chips de las activas + link a la
 *  pantalla completa (`/cuentas`), donde viven el saldo, el reajuste, las transferencias y el
 *  archivar/eliminar. */
function AccountsPanel() {
  const { data: locations } = useBalanceLocations()
  const active = (locations ?? []).filter((l) => !l.is_archived)
  const archivedCount = (locations ?? []).filter((l) => l.is_archived).length

  return (
    <Panel className="p-panel-tight">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Cuentas</p>
        {locations && locations.length > 0 && (
          <span className="shrink-0 text-[11.5px] text-fg-muted">
            {active.length} activa{active.length === 1 ? '' : 's'}
            {archivedCount > 0 && ` · ${archivedCount} archivada${archivedCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">Con qué pagás cada movimiento</p>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {active.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Todavía no cargaste ninguna.</p>
        ) : (
          active.map((l) => {
            const Icon = accountKindIcon(l.kind)
            return (
              <span
                key={l.id}
                className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken py-1.5 pr-[11px] pl-2.5 text-[12px] text-fg"
              >
                <Icon className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden />
                {l.name || '(sin nombre)'}
              </span>
            )
          })
        )}
      </div>

      <Link to="/cuentas" className="mt-4 inline-block text-[12.5px] font-semibold text-accent hover:opacity-80">
        Administrar cuentas
      </Link>
    </Panel>
  )
}

/** Mismo patrón que `AccountsPanel`: chips de las activas + link a la pantalla completa
 *  (`/categorias`), donde vive archivar/eliminar con sus confirmaciones. */
function CategoriesPanel() {
  const { data: categories } = useCategories(true)
  const active = (categories ?? []).filter((c) => !c.is_archived)
  const archivedCount = (categories ?? []).filter((c) => c.is_archived).length

  return (
    <Panel className="p-panel-tight">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Categorías</p>
        {categories && categories.length > 0 && (
          <span className="shrink-0 text-[11.5px] text-fg-muted">
            {active.length} activa{active.length === 1 ? '' : 's'}
            {archivedCount > 0 && ` · ${archivedCount} archivada${archivedCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">Con qué se agrupa cada movimiento</p>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {active.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Todavía no cargaste ninguna.</p>
        ) : (
          active.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken py-1.5 pr-[11px] pl-2.5 text-[12px] text-fg"
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          ))
        )}
      </div>

      <Link to="/categorias" className="mt-4 inline-block text-[12.5px] font-semibold text-accent hover:opacity-80">
        Administrar categorías
      </Link>
    </Panel>
  )
}

const cycleKinds: { value: CycleKind; label: string }[] = [
  { value: 'monthly', label: 'Mensual' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'weekly', label: 'Semanal' },
]

const weekdays: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

/** Ciclo de caja: la ventana con la que esta cuenta mira su plata — gobierna Hoy, Fijos, Mis Deudas,
 *  Movimientos y Análisis por igual (ver `src/lib/cycle.ts`). Mensual es el default y preserva el
 *  comportamiento de siempre; nadie pierde nada por no tocar este panel. Sólo con 'weekly' importa
 *  el día de arranque de la semana — el resto del tiempo la fila queda oculta, no deshabilitada, para
 *  no mostrar un control que no hace nada. */
function CiclosPanel() {
  const { data: profile, isPending } = useProfile()
  const updateProfile = useUpdateProfile()

  return (
    <Panel className="p-panel-tight">
      <p className="eyebrow">Ciclo</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">Con qué frecuencia mirás tu plata</p>

      {isPending ? (
        <Skeleton className="mt-3.5 h-9 w-full" />
      ) : (
        <>
          <SegmentedToggle
            value={profile?.cycleKind ?? 'monthly'}
            options={cycleKinds}
            onChange={(cycleKind) => updateProfile.mutate({ cycleKind })}
            className="mt-3.5"
          />
          {profile?.cycleKind === 'weekly' && (
            <div className="mt-3.5 border-t border-fill-subtle pt-3.5">
              <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">Arranca el</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {weekdays.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => updateProfile.mutate({ cycleWeekStartsOn: day.value })}
                    className={cn(
                      'rounded-chip px-[11px] py-[6px] text-[12px] transition-colors duration-150',
                      profile.cycleWeekStartsOn === day.value
                        ? 'bg-inverse font-semibold text-on-inverse'
                        : 'bg-fill-subtle text-fg-secondary hover:text-fg',
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

/** Dos miniaturas de teléfono claro/oscuro en vez de nombrar la opción — muestran el resultado. Los
 *  colores de cada miniatura son fijos (representan cómo se ve cada tema, no el tema actual); sólo
 *  el borde/fondo de "elegida" usa los tokens del tema en uso. */
function AppearancePanel() {
  const [dark, toggle] = useTheme()

  return (
    <Panel className="p-panel-tight">
      <p className="eyebrow">Apariencia</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dark ? toggle : undefined}
          aria-pressed={!dark}
          className={cn(
            'flex-1 rounded-[10px] p-2.5 text-left transition-colors duration-150',
            !dark ? 'border-[1.5px] border-accent bg-editing' : 'border border-border',
          )}
        >
          <div className="flex h-[34px] items-end gap-[3px] rounded-[6px] bg-[#efeee8] p-1">
            <span className="h-[9px] flex-1 rounded-[2px] bg-[#fbfaf6]" />
            <span className="h-5 w-[11px] rounded-[2px] bg-[#16171b]" />
          </div>
          <p className={cn('mt-2 text-[12px]', !dark ? 'font-semibold text-fg' : 'text-fg-secondary')}>Claro</p>
        </button>
        <button
          type="button"
          onClick={dark ? undefined : toggle}
          aria-pressed={dark}
          className={cn(
            'flex-1 rounded-[10px] p-2.5 text-left transition-colors duration-150',
            dark ? 'border-[1.5px] border-accent bg-editing' : 'border border-border',
          )}
        >
          <div className="flex h-[34px] items-end gap-[3px] rounded-[6px] bg-[#0f1014] p-1">
            <span className="h-[9px] flex-1 rounded-[2px] bg-[#262932]" />
            <span className="h-5 w-[11px] rounded-[2px] bg-[#f1f0ec]" />
          </div>
          <p className={cn('mt-2 text-[12px]', dark ? 'font-semibold text-fg' : 'text-fg-secondary')}>Oscuro</p>
        </button>
      </div>
    </Panel>
  )
}

/** Contraseña plegada a una fila con chevron — los tres campos aparecen recién al abrirla, no
 *  ocupando media pantalla por si acaso. "Cerrar sesión" queda siempre visible, sin chevron: no
 *  lleva a ningún lado, es la acción en sí. */
function SecurityPanel() {
  const [open, setOpen] = useState(false)

  return (
    <Panel className="p-panel-tight">
      <p className="eyebrow">Seguridad</p>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-fg">Contraseña</p>
          <p className="mt-0.5 text-[11.5px] text-fg-muted">Te pedimos la actual</p>
        </div>
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-fg-muted transition-transform duration-150', open && 'rotate-90')}
          strokeWidth={1.8}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      )}
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="mt-3.5 w-full border-t border-fill-subtle pt-3.5 text-left text-[13px] font-semibold text-negative"
      >
        Cerrar sesión
      </button>
    </Panel>
  )
}

export function Ajustes() {
  const canCompleto = useCan('ajustes-completo')
  const canCuentas = useCan('cuentas')

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Tu cuenta</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Ajustes</h1>
      </header>

      {canCompleto ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="flex flex-col gap-4">
            <FxPanel />
            <AssetsPanel />
          </div>
          <div className="flex flex-col gap-4">
            {canCuentas && <AccountsPanel />}
            <CategoriesPanel />
            <CiclosPanel />
            <AppearancePanel />
            <SecurityPanel />
          </div>
        </div>
      ) : (
        // Plan restringido: sin dólar — nada que gestionar todavía ahí. Cuentas aplica a Test (no a
        // Básico) y Categorías a los dos (fijos y movimientos manuales la usan), sumadas a lo que ya
        // pedía Lean para test/basic: ciclo, tema y seguridad, en una sola columna angosta.
        <div className="flex max-w-[420px] flex-col gap-4">
          {canCuentas && <AccountsPanel />}
          <CategoriesPanel />
          <CiclosPanel />
          <AppearancePanel />
          <SecurityPanel />
        </div>
      )}
    </div>
  )
}
