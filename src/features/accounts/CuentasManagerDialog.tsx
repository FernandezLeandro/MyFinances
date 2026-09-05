import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Pencil, Star, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import {
  useBalanceLocations,
  useCreateBalanceLocation,
  useSetDefaultBalanceLocation,
  useUpdateBalanceLocation,
  type AccountKind,
  type BalanceLocation,
} from '@/features/reconciliation/api'
import { useAccountTransfers, useDeleteAccountTransfer } from '@/features/accounts/transfers-api'
import { TransferDialog } from '@/features/accounts/TransferDialog'
import { accountKindIcon } from '@/features/accounts/accountKind'

interface CuentasManagerDialogProps {
  open: boolean
  onClose: () => void
}

const KIND_OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'wallet', label: 'Billetera virtual' },
  { value: 'bank', label: 'Banco' },
]

function AccountListItem({ location }: { location: BalanceLocation }) {
  const Icon = accountKindIcon(location.kind)
  const setDefault = useSetDefaultBalanceLocation()
  const updateLocation = useUpdateBalanceLocation()
  const [editing, setEditing] = useState(false)

  return (
    <li className="flex items-center gap-2.5 rounded-chip px-1 py-1.5">
      <Icon className="size-4 shrink-0 text-chalk-faint" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px]">{location.name || '(sin nombre)'}</p>
        <p className="text-[11px] text-chalk-faint">
          Apertura <Money cents={location.openingCents} tone="dim" size="inline" /> ·{' '}
          {format(parseISO(location.opening_on), 'd MMM yyyy', { locale: es })}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDefault.mutate(location.id)}
        aria-label={location.is_default ? `${location.name} es la predeterminada` : `Hacer predeterminada ${location.name}`}
        disabled={location.is_default || setDefault.isPending}
        className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-acid disabled:hover:bg-transparent"
      >
        <Star className={location.is_default ? 'size-3.5 fill-acid text-acid' : 'size-3.5'} strokeWidth={1.3} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        aria-label={`Editar ${location.name}`}
        className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
      >
        <Pencil className="size-3.5" strokeWidth={1.3} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => updateLocation.mutate({ id: location.id, isArchived: !location.is_archived })}
        aria-label={location.is_archived ? `Reactivar ${location.name}` : `Archivar ${location.name}`}
        className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-coral"
      >
        <X className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
      {editing && <AccountEditForm location={location} onDone={() => setEditing(false)} />}
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
    <div className="col-span-full mt-2 flex w-full flex-col gap-3 border-t border-ink-800 pt-3">
      <div className="flex gap-1.5">
        {KIND_OPTIONS.map((o) => (
          <Chip key={o.value} active={kind === o.value} onClick={() => setKind(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Efectivo, Mercado Pago, ICBC…" />
      </Field>
      <Field label="Apertura" hint="La plata que ya tenías antes de imputarle movimientos">
        <AmountInput value={openingInput} onChange={(e) => setOpeningInput(e.target.value)} />
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
 */
export function CuentasManagerDialog({ open, onClose }: CuentasManagerDialogProps) {
  const { data: locations } = useBalanceLocations()
  const { data: transfers } = useAccountTransfers()
  const createLocation = useCreateBalanceLocation()
  const deleteTransfer = useDeleteAccountTransfer()
  const locationById = new Map((locations ?? []).map((l) => [l.id, l]))

  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('cash')
  const [transferOpen, setTransferOpen] = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createLocation.mutateAsync({ name: trimmed, cents: 0, kind })
    setName('')
    setKind('cash')
  }

  const active = (locations ?? []).filter((l) => !l.is_archived)
  const archived = (locations ?? []).filter((l) => l.is_archived)

  return (
    <>
      <Dialog
        open={open && !transferOpen}
        onClose={onClose}
        title="Cuentas"
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <div className="flex flex-col gap-6">
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {active.map((l) => (
              <AccountListItem key={l.id} location={l} />
            ))}
            {archived.length > 0 && (
              <p className="mt-2 px-1 text-[11px] text-chalk-faint">Archivadas</p>
            )}
            {archived.map((l) => (
              <AccountListItem key={l.id} location={l} />
            ))}
          </ul>

          <div className="flex flex-col gap-3 border-t border-ink-800 pt-5">
            <p className="eyebrow">Nueva cuenta</p>
            <div className="flex gap-1.5">
              {KIND_OPTIONS.map((o) => (
                <Chip key={o.value} active={kind === o.value} onClick={() => setKind(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
            <Field label="Nombre">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Efectivo, Mercado Pago, ICBC…"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </Field>
            <Button variant="outline" onClick={handleCreate} disabled={!name.trim() || createLocation.isPending}>
              {createLocation.isPending ? 'Agregando…' : 'Agregar cuenta'}
            </Button>
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
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {(transfers ?? []).slice(0, 10).map((t) => (
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
