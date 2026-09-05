import { useState } from 'react'
import { Pencil, Star, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
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

/** Importe compacto, calcado del real declarado de `CuentaRow` — la apertura es un campo de setup
 *  que se toca una vez, y con `AmountInput` (h-14, display 3xl) terminaba siendo el elemento más
 *  grande de toda la pantalla. `inputMode="decimal"` mantiene el teclado numérico en el celular. */
function CompactAmountInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      aria-label={ariaLabel}
      className="tnum h-10 w-full rounded-control bg-ink-850 px-3 text-right text-[14px] text-chalk transition-colors focus:bg-ink-800 focus:outline-none"
    />
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
          al lado y aplastaba el nombre a una tira de ~90px. Las medidas de esta fila son las de
          `CuentaRow` a propósito: son las dos listas de cuentas de la app. */}
      <div className="flex items-center gap-3 rounded-control px-1 py-2">
        <Icon className="size-4 shrink-0 text-chalk-faint" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px]">{location.name || '(sin nombre)'}</p>
          {isBalancePending ? (
            <Skeleton className="mt-1 h-3 w-24" />
          ) : (
            <p className="text-[11px] text-chalk-faint">
              Según la app: <Money cents={derivedCents ?? location.openingCents} tone="dim" size="inline" />
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDefault.mutate(location.id)}
          aria-label={location.is_default ? `${location.name} es la predeterminada` : `Hacer predeterminada ${location.name}`}
          disabled={location.is_default || setDefault.isPending}
          className="rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-acid disabled:hover:bg-transparent"
        >
          <Star className={location.is_default ? 'size-4 fill-acid text-acid' : 'size-4'} strokeWidth={1.3} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-label={`Editar ${location.name}`}
          aria-expanded={editing}
          className="rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
        >
          <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => updateLocation.mutate({ id: location.id, isArchived: !location.is_archived })}
          aria-label={location.is_archived ? `Reactivar ${location.name}` : `Archivar ${location.name}`}
          className="rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
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
 *  `useUpdateBalanceLocation`), a diferencia de crear una nueva. */
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
    // Sangría + regla vertical en vez de un recuadro: se lee como "esto es de la fila de arriba"
    // sin encerrarlo. El `ml-7` lo alinea bajo el nombre (ícono size-4 + gap-3). Fondo sin cambios
    // — el sistema eleva por luminosidad, y entre ink-900 (diálogo) e ink-850 (inputs) no queda un
    // escalón intermedio sin que los campos se pierdan contra el panel.
    <div className="mt-1 mb-3 ml-7 flex flex-col gap-3 border-l border-ink-800 pt-1 pb-1 pl-4">
      <KindChips value={kind} onChange={setKind} />
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Efectivo, Mercado Pago, ICBC…" />
      </Field>
      <Field label="Apertura" hint="La plata que ya tenías antes de imputarle movimientos">
        <CompactAmountInput
          value={openingInput}
          onChange={setOpeningInput}
          ariaLabel={`Apertura de ${location.name || 'la cuenta'}`}
        />
      </Field>
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
 * desde Ajustes/perfil — a diferencia de `CategoryManagerDialog`, el alta acá pide un tipo además
 * del nombre, y cada fila expone "predeterminada" y "archivar" porque son las dos cosas que el
 * selector de cuenta del formulario de movimientos necesita resolver solo (ver `AccountSelect`).
 *
 * Sobre el layout: acá NO hay scroll propio en ninguna lista. El cuerpo del `Dialog` ya scrollea
 * (ver `Dialog.tsx`), y un `max-h-*` con `overflow-y-auto` adentro le sumaba una segunda barra para
 * tres o cuatro filas. Por el mismo motivo las transferencias se acotan por cantidad y no por alto.
 *
 * Sólo una cosa abierta a la vez (una edición o el alta, nunca las dos ni dos ediciones): con el
 * acordeón por fila, dejar que se acumulen estira el diálogo sin techo.
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
  const [transferOpen, setTransferOpen] = useState(false)

  const active = (locations ?? []).filter((l) => !l.is_archived)
  const archived = (locations ?? []).filter((l) => l.is_archived)

  // Sin ninguna cuenta activa el alta arranca abierta y sin trigger: esconder el único camino
  // disponible detrás de un botón deja la pantalla vacía y sin salida.
  const showCreateForm = creating || active.length === 0

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
    await createLocation.mutateAsync({ name: trimmed, cents: 0, kind })
    setName('')
    setKind('cash')
    setCreating(false)
  }

  return (
    <>
      <Dialog
        open={open && !transferOpen}
        onClose={onClose}
        title="Cuentas"
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-1">
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
            {archived.length > 0 && <p className="mt-2 px-1 text-[11px] text-chalk-faint">Archivadas</p>}
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

          <div className="border-t border-ink-800 pt-5">
            {showCreateForm ? (
              <div className="flex flex-col gap-3">
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
                <div className="flex gap-2">
                  {active.length > 0 && (
                    <Button variant="ghost" onClick={() => setCreating(false)} className="flex-1">
                      Cancelar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleCreate}
                    disabled={!name.trim() || createLocation.isPending}
                    className="flex-1"
                  >
                    {createLocation.isPending ? 'Agregando…' : 'Agregar cuenta'}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCreate}
                className="text-[12px] font-medium text-acid hover:underline"
              >
                + Agregar cuenta
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-ink-800 pt-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Transferencias recientes</p>
              <button type="button" onClick={() => setTransferOpen(true)} className="text-[12px] font-medium text-acid hover:underline">
                + Transferir
              </button>
            </div>
            {(transfers ?? []).length === 0 ? (
              <p className="text-[12px] text-chalk-faint">Todavía no hiciste ninguna.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(transfers ?? []).slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-chip px-1 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-chalk-dim">
                      {locationById.get(t.from_account_id)?.name || '?'} → {locationById.get(t.to_account_id)?.name || '?'}
                    </span>
                    <Money cents={t.cents} tone="dim" size="inline" />
                    <button
                      type="button"
                      onClick={() => deleteTransfer.mutate(t.id)}
                      aria-label="Eliminar transferencia"
                      className="shrink-0 rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
                    >
                      <X className="size-3.5" strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Dialog>

      {transferOpen && <TransferDialog open={transferOpen} onClose={() => setTransferOpen(false)} />}
    </>
  )
}
