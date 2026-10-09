import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { cn } from '@/lib/cn'
import { showToast } from '@/lib/toast'
import { useProfile, useUpdateProfile, type CycleKind } from '@/features/profile/api'
import { ChangePasswordForm } from '@/features/auth/ChangePasswordPanel'
import { useCurrentBalance } from '@/features/transactions/api'
import { useBalanceLocations, useStopUsingAccounts } from '@/features/accounts/api'
import { StopUsingAccountsDialog } from '@/features/accounts/AccountConfirmDialogs'
import { accountKindIcon } from '@/features/accounts/accountKind'
import { useCategories } from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { useTheme } from '@/lib/useTheme'
import { supabase } from '@/lib/supabase'
import { useCan } from '@/features/access/useCan'

const accountsToggleOptions = [
  { value: 'on', label: 'Activadas' },
  { value: 'off', label: 'Desactivadas' },
] as const

/** El interruptor de Cuentas: la app decide de menos a más, y ésta es la decisión de "uso" — no hay
 *  columna nueva en `profiles` para esto, el estado es simplemente "tiene alguna cuenta o no".
 *  Activar navega a `/cuentas` con el alta de la primera cuenta ya abierta (`state: { startAccounts:
 *  true }`, ver `Cuentas.tsx`); desactivar pide confirmar acá mismo y llama a
 *  `rpc_stop_using_accounts` (`useStopUsingAccounts`), que guarda el saldo de hoy como un ajuste y no
 *  toca ningún movimiento — apagar y prender no pierde nada. */
function AccountsPanel() {
  const navigate = useNavigate()
  const { data: locations, isPending } = useBalanceLocations()
  const { data: currentBalanceCents } = useCurrentBalance()
  const stopUsingAccounts = useStopUsingAccounts()
  const [confirmOff, setConfirmOff] = useState(false)

  const all = locations ?? []
  const active = all.filter((l) => !l.is_archived)
  const archivedCount = all.filter((l) => l.is_archived).length
  const isOn = all.length > 0

  function handleToggle(next: 'on' | 'off') {
    if (next === 'on') {
      if (!isOn) navigate('/cuentas', { state: { startAccounts: true } })
      return
    }
    if (isOn) setConfirmOff(true)
  }

  return (
    <Panel className="p-panel-tight">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Cuentas</p>
        {isOn && (
          <span className="shrink-0 text-[11.5px] text-fg-muted">
            {active.length} activa{active.length === 1 ? '' : 's'}
            {archivedCount > 0 && ` · ${archivedCount} archivada${archivedCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-muted">Con qué pagás cada movimiento</p>

      {isPending ? (
        <Skeleton className="mt-3.5 h-9 w-full" />
      ) : (
        <>
          <SegmentedToggle value={isOn ? 'on' : 'off'} options={accountsToggleOptions} onChange={handleToggle} className="mt-3.5" />

          {isOn ? (
            <>
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {active.map((l) => {
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
                })}
              </div>

              <Link to="/cuentas" className="mt-4 inline-block text-[12.5px] font-semibold text-accent hover:opacity-80">
                Administrar cuentas
              </Link>
            </>
          ) : (
            <p className="mt-3.5 text-[12.5px] leading-relaxed text-fg-muted">
              Cargás tus movimientos sin decir con qué cuenta se pagaron.
            </p>
          )}
        </>
      )}

      {confirmOff && (
        <StopUsingAccountsDialog
          onClose={() => setConfirmOff(false)}
          balanceCents={currentBalanceCents ?? 0}
          accountCount={all.length}
          isCountsPending={currentBalanceCents === undefined}
          onConfirm={async () => {
            await stopUsingAccounts.mutateAsync()
            showToast('Cuentas desactivado', 'ok', { detail: 'Tu saldo y tus movimientos quedaron igual que antes.' })
            setConfirmOff(false)
          }}
        />
      )}
    </Panel>
  )
}

/** Mismo patrón que `AccountsPanel`: chips de las activas + link a la pantalla completa
 *  (`/categorias`), donde vive archivar/eliminar con sus confirmaciones. */
function CategoriesPanel() {
  const { data: allCategories } = useCategories(true)
  // Las de inversión no agrupan movimientos: viven en su pestaña de /categorias.
  const categories = allCategories?.filter((c) => c.kind !== 'investment')
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
              className="inline-flex items-center gap-1.5 rounded-pill bg-surface-sunken py-1 pr-[11px] pl-1 text-[12px] text-fg"
            >
              <CategoryChip size={16} {...chipLook(c)} />
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
  const canCuentas = useCan('cuentas')

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Tu cuenta</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Ajustes</h1>
      </header>

      {/* Una sola columna angosta para todos los planes; Cuentas sólo aparece donde el plan la tiene. */}
      <div className="flex max-w-[420px] flex-col gap-4">
        {canCuentas && <AccountsPanel />}
        <CategoriesPanel />
        <CiclosPanel />
        <AppearancePanel />
        <SecurityPanel />
      </div>
    </div>
  )
}
