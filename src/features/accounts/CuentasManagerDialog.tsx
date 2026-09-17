import { useState } from 'react'
import { Pencil, Star, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogBottomBar, DialogSection, type DialogStatus } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import {
  useAccountBalances,
  useBalanceLocations,
  useCreateBalanceLocation,
  useSetDefaultBalanceLocation,
  useUpdateBalanceLocation,
  type AccountKind,
  type BalanceLocation,
} from '@/features/reconciliation/api'
import { useAccountTransfers, useDeleteAccountTransfer } from '@/features/accounts/transfers-api'
import { TransferDialog } from '@/features/accounts/TransferDialog'
import { ACCOUNT_KIND_LABEL, accountKindIcon } from '@/features/accounts/accountKind'

interface CuentasManagerDialogProps {
  open: boolean
  onClose: () => void
}

/** Derivado de `ACCOUNT_KIND_LABEL` y no reescrito a mano: las etiquetas de tipo ya viven ahí y las
 *  usa también `AccountSelect`. El orden lo fija este array, no el del objeto. */
const KIND_OPTIONS: { value: AccountKind; label: string }[] = (
  ['cash', 'wallet', 'bank'] as const
).map((value) => ({ value, label: ACCOUNT_KIND_LABEL[value] }))

/** Los mismos tres chips en el alta y en la edición — un solo lugar donde tocarlos. */
function KindChips({ value, onChange }: { value: AccountKind; onChange: (kind: AccountKind) => void }) {
  return (
    <div className="flex gap-1.5">
      {KIND_OPTIONS.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

function AccountListItem({
  location,
  derivedCents,
  isBalancePending,
  editing,
  onToggleEdit,
}: {
  location: BalanceLocation
  derivedCents: number | undefined
  isBalancePending: boolean
  editing: boolean
  onToggleEdit: () => void
}) {
  const Icon = accountKindIcon(location.kind)
  const setDefault = useSetDefaultBalanceLocation()
  const updateLocation = useUpdateBalanceLocation()

  return (
    <li className="flex flex-col">
      {/* Fila y formulario son hermanos en una columna — antes el form era un hermano FLEX de este
          contenido (el `col-span-full` que traía es de grid y no hacía nada acá), así que se metía
          al lado y aplastaba el nombre a una tira de ~90px. */}
      <div className="flex items-center gap-3 px-[15px] py-2">
        <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px]">{location.name || '(sin nombre)'}</p>
          {isBalancePending ? (
            <Skeleton className="mt-1 h-3 w-24" />
          ) : (
            <p className="text-[11px] text-fg-muted">
              Según la app: <Money cents={derivedCents ?? location.openingCents} tone="dim" size="inline" />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDefault.mutate(location.id)}
          aria-label={location.is_default ? `${location.name} es la predeterminada` : `Hacer predeterminada ${location.name}`}
          disabled={location.is_default || setDefault.isPending}
          className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-accent disabled:hover:bg-transparent"
        >
          <Star className={location.is_default ? 'size-4 fill-accent text-accent' : 'size-4'} strokeWidth={1.3} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label={`Editar ${location.name}`}
          aria-expanded={editing}
          className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
        >
          <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => updateLocation.mutate({ id: location.id, isArchived: !location.is_archived })}
          aria-label={location.is_archived ? `Reactivar ${location.name}` : `Archivar ${location.name}`}
          className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
        >
          <X className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {editing && <AccountEditForm location={location} onDone={onToggleEdit} />}
    </li>
  )
}

/** Editor inline de una cuenta existente — nombre, tipo y apertura. Separado del alta (más abajo)
 *  porque tocar la apertura de una cuenta ya usada SÍ recalcula su derivado (invalidación en
 *  `useUpdateBalanceLocation`), a diferencia de crear una nueva.
 *
 *  Sangría de 43px con regla vertical (21a): se lee como "esto es de la fila de arriba" sin
 *  encerrarlo en una caja. */
function AccountEditForm({ location, onDone }: { location: BalanceLocation; onDone: () => void }) {
  const updateLocation = useUpdateBalanceLocation()
  const [name, setName] = useState(location.name)
  const [kind, setKind] = useState<AccountKind>(location.kind)
  const [openingInput, setOpeningInput] = useState(() => centsToInputText(location.openingCents))

  async function save() {
    const trimmed = name.trim()
    const openingCents = parseAmountToCents(openingInput) ?? location.openingCents
    await updateLocation.mutateAsync({ id: location.id, name: trimmed, kind, openingCents })
    onDone()
  }

  return (
    <div className="mt-1 mb-3 ml-[43px] flex flex-col gap-3 border-l border-border pl-4">
      <KindChips value={kind} onChange={setKind} />
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Efectivo, Mercado Pago, ICBC…" />
      </Field>
      <OpeningAmountField
        label="Apertura"
        hint="La plata que ya tenías antes de imputarle movimientos"
        value={openingInput}
        onChange={setOpeningInput}
        ariaLabel={`Apertura de ${location.name || 'la cuenta'}`}
      />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone} className="flex-1">
          Cancelar
        </Button>
        <Button variant="outline" onClick={save} disabled={!name.trim() || updateLocation.isPending} className="flex-1">
          {updateLocation.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Administra las cuentas (antes "lugares") y sus transferencias. Se abre desde Cuadrar Saldo y
 * desde Ajustes/perfil — a diferencia de `pages/Categorias.tsx`, el alta acá pide un tipo además
 * del nombre, y cada fila expone "predeterminada" y "archivar" porque son las dos cosas que el
 * selector de cuenta del formulario de movimientos necesita resolver solo (ver `AccountSelect`).
 *
 * Arquetipo 4 (19a): tres secciones plegables — Activas, Archivadas, Transferencias recientes —
 * cada una dice su subtotal y cantidad cerrada, así que las dos últimas no estiran el diálogo
 * cuando no se están mirando. Sólo una sección abierta a la vez.
 *
 * Sobre el layout: acá NO hay scroll propio en ninguna lista. El cuerpo del `Dialog` ya scrollea
 * (ver `Dialog.tsx`), y un `max-h-*` con `overflow-y-auto` adentro le sumaba una segunda barra para
 * tres o cuatro filas.
 *
 * Sólo una cosa abierta a la vez adentro de "Activas" (una edición o el alta, nunca las dos ni dos
 * ediciones): con el acordeón por fila, dejar que se acumulen estira el diálogo sin techo.
 */
export function CuentasManagerDialog({ open, onClose }: CuentasManagerDialogProps) {
  const { data: locations } = useBalanceLocations()
  const { data: accountBalances, isPending: isBalancePending } = useAccountBalances()
  const { data: transfers } = useAccountTransfers()
  const createLocation = useCreateBalanceLocation()
  const deleteTransfer = useDeleteAccountTransfer()
  const locationById = new Map((locations ?? []).map((l) => [l.id, l]))

  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('cash')
  const [openingInput, setOpeningInput] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [openSection, setOpenSection] = useState<'activas' | 'archivadas' | 'transferencias' | null>('activas')

  const active = (locations ?? []).filter((l) => !l.is_archived)
  const archived = (locations ?? []).filter((l) => l.is_archived)
  const allTransfers = transfers ?? []

  // Sin ninguna cuenta activa el alta arranca abierta y sin trigger: esconder el único camino
  // disponible detrás de un botón deja la pantalla vacía y sin salida.
  const showCreateForm = creating || active.length === 0

  const activeTotalCents = active.reduce((sum, l) => sum + (accountBalances?.get(l.id) ?? l.openingCents), 0)
  const defaultLocation = active.find((l) => l.is_default)
  const activasStatus: DialogStatus = active.length > 0 ? 'accent' : 'neutral'
  const activasContext = active.length === 0
    ? 'Sin cuentas cargadas'
    : `${active.length} cuenta${active.length === 1 ? '' : 's'}${defaultLocation ? ` · ${defaultLocation.name} es la predeterminada` : ''}`

  const archivedContext =
    archived.length === 1 ? `${archived[0].name} · no suma al total` : `${archived.length} archivadas · no suman al total`

  const lastTransfer = allTransfers[0]
  const transfersContext = lastTransfer
    ? `La última: ${locationById.get(lastTransfer.from_account_id)?.name ?? '?'} → ${locationById.get(lastTransfer.to_account_id)?.name ?? '?'}`
    : 'Todavía no hiciste ninguna'

  function toggleSection(section: 'activas' | 'archivadas' | 'transferencias') {
    setOpenSection((current) => (current === section ? null : section))
  }

  function startEdit(id: string) {
    setEditingId((current) => (current === id ? null : id))
    setCreating(false)
  }

  function startCreate() {
    setCreating(true)
    setEditingId(null)
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    const openingCents = parseAmountToCents(openingInput) ?? 0
    await createLocation.mutateAsync({ name: trimmed, cents: openingCents, openingCents, kind })
    setName('')
    setKind('cash')
    setOpeningInput('')
    setCreating(false)
  }

  return (
    <>
      <Dialog
        open={open && !transferOpen}
        onClose={onClose}
        title="Cuentas"
        footerBleed
        footer={
          <DialogBottomBar
            label="Según la app"
            figure={
              <span className="tnum font-display text-2xl font-bold tracking-[-0.03em] text-fg">
                {formatMoney(activeTotalCents)}
              </span>
            }
            action={
              <Button size="compact" onClick={onClose}>
                Listo
              </Button>
            }
            secondary={
              <button type="button" onClick={() => setTransferOpen(true)} className="hover:underline">
                …o <span className="font-medium text-accent">transferir plata entre dos cuentas</span>.
              </button>
            }
          />
        }
      >
        <div className="flex flex-col gap-2">
          <DialogSection
            title="Activas"
            status={activasStatus}
            context={activasContext}
            subtotal={formatMoney(activeTotalCents)}
            open={openSection === 'activas'}
            onToggle={() => toggleSection('activas')}
            footer={
              !showCreateForm && (
                <>
                  <button type="button" onClick={startCreate} className="text-[12px] font-medium text-accent hover:underline">
                    + Agregar cuenta
                  </button>
                  <span className="text-[11.5px] text-fg-muted">La estrella marca la predeterminada</span>
                </>
              )
            }
          >
            <ul className="flex flex-col">
              {active.map((l) => (
                <AccountListItem
                  key={l.id}
                  location={l}
                  derivedCents={accountBalances?.get(l.id)}
                  isBalancePending={isBalancePending}
                  editing={editingId === l.id}
                  onToggleEdit={() => startEdit(l.id)}
                />
              ))}
            </ul>

            {showCreateForm && (
              <div className={cn('mx-[15px] mt-2 mb-3 flex flex-col gap-3 rounded-control border-l-2 border-accent bg-editing p-3.5')}>
                <p className="eyebrow">Nueva cuenta</p>
                <KindChips value={kind} onChange={setKind} />
                <Field label="Nombre">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Efectivo, Mercado Pago, ICBC…"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                </Field>
                <OpeningAmountField
                  label="Apertura"
                  hint="Lo que ya tenías antes de cargar el primer movimiento"
                  value={openingInput}
                  onChange={setOpeningInput}
                  ariaLabel="Apertura de la cuenta nueva"
                />
                <div className="flex gap-2">
                  {active.length > 0 && (
                    <Button variant="ghost" onClick={() => setCreating(false)} className="flex-1">
                      Cancelar
                    </Button>
                  )}
                  <Button onClick={handleCreate} disabled={!name.trim() || createLocation.isPending} className="flex-1">
                    {createLocation.isPending ? 'Agregando…' : 'Agregar cuenta'}
                  </Button>
                </div>
              </div>
            )}
          </DialogSection>

          {archived.length > 0 && (
            <DialogSection
              title="Archivadas"
              status="neutral"
              context={archivedContext}
              subtotal={archived.length}
              open={openSection === 'archivadas'}
              onToggle={() => toggleSection('archivadas')}
            >
              <ul className="flex flex-col">
                {archived.map((l) => (
                  <AccountListItem
                    key={l.id}
                    location={l}
                    derivedCents={accountBalances?.get(l.id)}
                    isBalancePending={isBalancePending}
                    editing={editingId === l.id}
                    onToggleEdit={() => startEdit(l.id)}
                  />
                ))}
              </ul>
            </DialogSection>
          )}

          <DialogSection
            title="Transferencias recientes"
            status="neutral"
            context={transfersContext}
            subtotal={allTransfers.length}
            open={openSection === 'transferencias'}
            onToggle={() => toggleSection('transferencias')}
            footer={
              <button type="button" onClick={() => setTransferOpen(true)} className="text-[12px] font-medium text-accent hover:underline">
                + Transferir
              </button>
            }
          >
            {allTransfers.length === 0 ? (
              <p className="px-[15px] py-3 text-[12px] text-fg-muted">Todavía no hiciste ninguna.</p>
            ) : (
              <ul className="flex flex-col">
                {allTransfers.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-[15px] py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-fg-secondary">
                      {locationById.get(t.from_account_id)?.name || '?'} → {locationById.get(t.to_account_id)?.name || '?'}
                    </span>
                    <Money cents={t.cents} tone="dim" size="inline" />
                    <button
                      type="button"
                      onClick={() => deleteTransfer.mutate(t.id)}
                      aria-label="Eliminar transferencia"
                      className="shrink-0 rounded-chip p-1 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
                    >
                      <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </DialogSection>
        </div>
      </Dialog>

      {transferOpen && <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />}
    </>
  )
}
