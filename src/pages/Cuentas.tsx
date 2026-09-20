import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { EllipsisVertical, Star, X } from 'lucide-react'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Money } from '@/components/ui/Money'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Skeleton } from '@/components/ui/Skeleton'
import { centsToInputText } from '@/lib/money'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useAccountBalances,
  useArchiveAccount,
  useBalanceLocations,
  useDeleteAccount,
  useSetDefaultBalanceLocation,
  type BalanceLocation,
} from '@/features/accounts/api'
import { useAccountTransfers, useDeleteAccountTransfer } from '@/features/accounts/transfers-api'
import { accountsTotals, movimientosDeCuentaState } from '@/features/accounts/aggregate'
import { ACCOUNT_KIND_LABEL, accountKindIcon } from '@/features/accounts/accountKind'
import { AccountRowEditor } from '@/features/accounts/AccountRowEditor'
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog'
import { ArchiveAccountDialog, DeleteAccountDialog } from '@/features/accounts/AccountConfirmDialogs'
import { TransferDialog } from '@/features/accounts/TransferDialog'

interface AccountRowProps {
  account: BalanceLocation
  balanceCents: number
  isBalancePending: boolean
  canTransfer: boolean
  editing: boolean
  onAdjust: () => void
  onEdit: () => void
  onSetDefault: () => void
  onTransfer: () => void
  onViewMovements: () => void
  onArchive: () => void
  onReactivate: () => void
  onDelete: () => void
}

/** Una cuenta: ícono de tipo, nombre, saldo y un menú con todo lo que se le puede hacer. Menú y no
 *  una hilera de íconos: seis acciones no entran a 320px. */
function AccountRow({
  account,
  balanceCents,
  isBalancePending,
  canTransfer,
  editing,
  onAdjust,
  onEdit,
  onSetDefault,
  onTransfer,
  onViewMovements,
  onArchive,
  onReactivate,
  onDelete,
}: AccountRowProps) {
  const Icon = accountKindIcon(account.kind)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function run(action: () => void) {
    setMenuOpen(false)
    action()
  }

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-3 px-panel py-2.5">
        <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] text-fg">
            <span className="truncate">{account.name || '(sin nombre)'}</span>
            {account.is_default && (
              <Star aria-label="Cuenta predeterminada" className="size-3.5 shrink-0 fill-accent text-accent" strokeWidth={1.3} />
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-fg-muted">{ACCOUNT_KIND_LABEL[account.kind]}</p>
        </div>
        <div className="shrink-0 text-right">
          {isBalancePending ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            <Money cents={balanceCents} tone={balanceCents < 0 ? 'negative' : 'fg'} size="row" />
          )}
        </div>
        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`Acciones de ${account.name || 'la cuenta'}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
          >
            <EllipsisVertical className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
          <Menu open={menuOpen} onClose={() => setMenuOpen(false)} triggerRef={triggerRef} anchorClassName="top-full right-0 mt-1 w-52">
            <MenuItem onClick={() => run(onAdjust)}>Reajustar saldo</MenuItem>
            <MenuItem onClick={() => run(onEdit)}>Editar nombre y tipo</MenuItem>
            {!account.is_archived && !account.is_default && (
              <MenuItem onClick={() => run(onSetDefault)}>Hacer predeterminada</MenuItem>
            )}
            {!account.is_archived && canTransfer && <MenuItem onClick={() => run(onTransfer)}>Transferir</MenuItem>}
            <MenuItem onClick={() => run(onViewMovements)}>Ver movimientos</MenuItem>
            {account.is_archived ? (
              <MenuItem onClick={() => run(onReactivate)}>Reactivar</MenuItem>
            ) : (
              <MenuItem onClick={() => run(onArchive)}>Archivar</MenuItem>
            )}
            <MenuItem tone="danger" onClick={() => run(onDelete)}>
              Eliminar
            </MenuItem>
          </Menu>
        </div>
      </div>
      {editing && <AccountRowEditor mode="edit" location={account} onDone={onEdit} />}
    </li>
  )
}

/**
 * Pantalla de cuentas (`/cuentas`, Test y Premium). Reemplaza a "Cuadrar saldo": el saldo de la app
 * es la SUMA de estas cuentas (`rpc_current_balance`), así que acá se ve de qué está hecho y es el
 * único lugar donde se reajusta — a pedido, no como comparación permanente.
 *
 * - Activas: se ofrecen al cargar movimientos. Archivar la saca de los selectores pero su saldo sigue
 *   sumando (por eso "Archivadas" muestra el saldo).
 * - Eliminar: borra la cuenta con sus movimientos y transferencias; lo que se pagó desde ahí sigue
 *   como pagado.
 * - La apertura no se edita: la primera vez se pregunta "¿cuánto tenés hoy?", y después sólo cambia
 *   con "Reajustar saldo → corregir el saldo inicial".
 */
export function Cuentas() {
  const navigate = useNavigate()
  const { data: locations, isPending } = useBalanceLocations()
  const { data: balances, isPending: isBalancePending } = useAccountBalances()
  const { data: transfers } = useAccountTransfers()
  const { data: currentBalanceCents } = useCurrentBalance()
  const setDefault = useSetDefaultBalanceLocation()
  const archive = useArchiveAccount()
  const deleteAccount = useDeleteAccount()
  const deleteTransfer = useDeleteAccountTransfer()

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<BalanceLocation | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<BalanceLocation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BalanceLocation | null>(null)
  const [transferFrom, setTransferFrom] = useState<string | null>(null)

  const all = locations ?? []
  const active = all.filter((l) => !l.is_archived)
  const archived = all.filter((l) => l.is_archived)
  const balanceMap = useMemo(() => balances ?? new Map<string, number>(), [balances])
  const totals = accountsTotals(all, balanceMap)
  const locationById = new Map(all.map((l) => [l.id, l]))
  const recentTransfers = (transfers ?? []).slice(0, 5)

  // Sin ninguna cuenta el alta arranca abierta y sin trigger: esconder el único camino disponible
  // detrás de un botón deja la pantalla vacía y sin salida.
  const hasNoAccounts = !isPending && all.length === 0
  const showCreate = creating || hasNoAccounts
  // La primera cuenta viene con el saldo actual de la app — crearla no debería mover el saldo.
  const initialOpening = hasNoAccounts && currentBalanceCents !== undefined ? centsToInputText(currentBalanceCents) : ''

  function balanceOf(account: BalanceLocation): number {
    return balanceMap.get(account.id) ?? account.openingCents
  }

  function viewMovements(account: BalanceLocation) {
    navigate('/movimientos', { state: movimientosDeCuentaState(account.id, format(new Date(), 'yyyy-MM-dd')) })
  }

  function toggleEdit(id: string) {
    setEditingId((current) => (current === id ? null : id))
    setCreating(false)
  }

  function renderRows(list: BalanceLocation[]) {
    return (
      <ul className="flex flex-col divide-y divide-fill-subtle pb-2">
        {list.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            balanceCents={balanceOf(account)}
            isBalancePending={isBalancePending}
            canTransfer={active.length >= 2}
            editing={editingId === account.id}
            onAdjust={() => setAdjustTarget(account)}
            onEdit={() => toggleEdit(account.id)}
            onSetDefault={() => setDefault.mutate(account.id)}
            onTransfer={() => setTransferFrom(account.id)}
            onViewMovements={() => viewMovements(account)}
            onArchive={() => setArchiveTarget(account)}
            onReactivate={() => archive.mutate({ id: account.id, archived: false })}
            onDelete={() => setDeleteTarget(account)}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Tu plata</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Cuentas</h1>
        {all.length > 0 && (
          <div className="mt-4">
            <p className="eyebrow">Total en tus cuentas</p>
            {isBalancePending ? (
              <Skeleton className="mt-2 h-9 w-48" />
            ) : (
              <Money cents={totals.totalCents} tone="accent" size="total" className="mt-2 block" />
            )}
            <p className="mt-2 max-w-md text-[13px] text-fg-muted">Es tu saldo actual: la suma de todas tus cuentas.</p>
          </div>
        )}
      </header>

      {isPending ? (
        <Panel className="p-panel">
          <Skeleton className="h-40 w-full" />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.85fr_1fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <PanelHeader
                title="Activas"
                hint={active.length > 0 ? 'Con qué pagás cada movimiento' : undefined}
                action={
                  !showCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(true)
                        setEditingId(null)
                      }}
                      className="shrink-0 text-[12px] font-semibold text-accent hover:opacity-80"
                    >
                      + Nueva cuenta
                    </button>
                  )
                }
              />
              {active.length > 0 && renderRows(active)}
              {showCreate && (
                <>
                  {hasNoAccounts && (
                    <p className="px-panel pb-2 text-[13px] text-fg-muted">
                      Es tu saldo actual en la app. Si tu plata está repartida en varias cuentas, poné sólo lo de esta y
                      después sumás las otras.
                    </p>
                  )}
                  <AccountRowEditor
                    key={initialOpening}
                    mode="create"
                    initialOpening={initialOpening}
                    onCancel={active.length > 0 ? () => setCreating(false) : undefined}
                    onDone={() => setCreating(false)}
                  />
                </>
              )}
            </Panel>

            {archived.length > 0 && (
              <Panel>
                <PanelHeader title="Archivadas" hint="Siguen sumando a tu saldo" />
                {renderRows(archived)}
              </Panel>
            )}
          </div>

          <Panel>
            <PanelHeader
              title="Transferencias recientes"
              action={
                active.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setTransferFrom('')}
                    className="shrink-0 text-[12px] font-semibold text-accent hover:opacity-80"
                  >
                    + Transferir
                  </button>
                )
              }
            />
            {recentTransfers.length === 0 ? (
              <p className="px-panel pb-5 text-[13px] text-fg-muted">
                {active.length >= 2 ? 'Todavía no hiciste ninguna.' : 'Con dos cuentas podés pasar plata de una a otra.'}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-fill-subtle pb-2">
                {recentTransfers.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-panel py-2.5 text-[13px]">
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
          </Panel>
        </div>
      )}

      {adjustTarget && (
        <AdjustBalanceDialog
          open
          onClose={() => setAdjustTarget(null)}
          account={adjustTarget}
          derivedCents={balanceOf(adjustTarget)}
        />
      )}
      {archiveTarget && (
        <ArchiveAccountDialog
          open
          onClose={() => setArchiveTarget(null)}
          account={archiveTarget}
          balanceCents={balanceOf(archiveTarget)}
          activeCount={active.length}
          pending={archive.isPending}
          onConfirm={async () => {
            await archive.mutateAsync({ id: archiveTarget.id, archived: true })
            setArchiveTarget(null)
          }}
        />
      )}
      {deleteTarget && (
        <DeleteAccountDialog
          open
          onClose={() => setDeleteTarget(null)}
          account={deleteTarget}
          isLastAccount={all.length === 1}
          pending={deleteAccount.isPending}
          onConfirm={async () => {
            await deleteAccount.mutateAsync(deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      )}
      {transferFrom !== null && <TransferDialog open onClose={() => setTransferFrom(null)} fromAccountId={transferFrom} />}
    </div>
  )
}
