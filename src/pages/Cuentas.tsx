import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { ErrorState } from '@/components/ui/ErrorState'
import { PageBreadcrumb } from '@/components/ui/PageBreadcrumb'
import { Skeleton } from '@/components/ui/Skeleton'
import { showToast } from '@/lib/toast'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useAccountBalances,
  useArchiveAccount,
  useBalanceLocations,
  useDeleteAccount,
  type BalanceLocation,
} from '@/features/accounts/api'
import { useAccountTransfers } from '@/features/accounts/transfers-api'
import {
  accountColor,
  accountComposition,
  accountsForGrid,
  accountsTotals,
  archiveBlocker,
  archiveResultText,
  movimientosDeCuentaState,
  type AccountMenuActionId,
} from '@/features/accounts/aggregate'
import { AccountActionsMenu } from '@/features/accounts/AccountActionsMenu'
import { AccountCard } from '@/features/accounts/AccountCard'
import { AccountFormDialog } from '@/features/accounts/AccountFormDialog'
import { AccountTotalCard } from '@/features/accounts/AccountTotalCard'
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog'
import { DeleteAccountDialog } from '@/features/accounts/AccountConfirmDialogs'
import { ArchivedAccountsList, RecentTransfersList } from '@/features/accounts/AccountSecondaryLists'
import { CollapsibleCell } from '@/features/accounts/CollapsibleCell'
import { TransferDialog } from '@/features/accounts/TransferDialog'
import { useAccountActions } from '@/features/accounts/useAccountActions'

/** Un solo diálogo a la vez. Los que operan sobre una cuenta la guardan por id, no por objeto: si la
 *  cuenta desaparece (se eliminó), el diálogo se desmonta solo en vez de quedar con una copia vieja. */
type DialogState =
  | { kind: 'create' }
  | { kind: 'transfer'; fromAccountId: string }
  | { kind: 'adjust' | 'edit' | 'delete'; accountId: string }
  | null

/**
 * Pantalla de cuentas (`/cuentas`, Test y Premium; se llega desde Ajustes y desde Hoy). El saldo de
 * la app es la SUMA de estas cuentas (`rpc_current_balance`), así que acá se ve de qué está hecho y
 * es el único lugar donde se reajusta — a pedido, no como comparación permanente.
 *
 * - Una tarjeta por cuenta; la predeterminada es la oscura. "Reajustar saldo" es la acción principal
 *   y el resto va en el menú `⋯`.
 * - Archivar la saca de los selectores y del saldo; Archivadas muestra lo que tiene cada una y al
 *   reactivarla vuelve a sumar.
 * - Eliminar borra la cuenta con sus movimientos y transferencias; lo que se pagó desde ahí sigue
 *   como pagado.
 * - La apertura no se edita: la primera vez se pregunta "¿cuánto tenés hoy?", y después sólo cambia
 *   con "Reajustar saldo → corregir el saldo inicial".
 * - Los diálogos muestran adentro sus errores y validaciones; el resultado (y las fallas de lo que no
 *   tiene diálogo) sale como aviso. Nunca los dos por el mismo evento.
 */
export function Cuentas() {
  const navigate = useNavigate()
  const { data: locations, isPending, isError, refetch } = useBalanceLocations()
  const { data: balances, isPending: isBalancePending } = useAccountBalances()
  const { data: transfers } = useAccountTransfers()
  const { data: currentBalanceCents } = useCurrentBalance()
  const archive = useArchiveAccount()
  const deleteAccount = useDeleteAccount()
  const actions = useAccountActions()

  const [dialog, setDialog] = useState<DialogState>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [transfersOpen, setTransfersOpen] = useState(false)

  const all = useMemo(() => locations ?? [], [locations])
  const balanceMap = useMemo(() => balances ?? new Map<string, number>(), [balances])
  const { accounts, archived, defaultId } = accountsForGrid(all)
  const totals = accountsTotals(all, balanceMap)
  const composition = accountComposition(all, balanceMap)
  const byId = new Map(all.map((l) => [l.id, l]))
  const recentTransfers = (transfers ?? []).slice(0, 5)
  const canArchive = archiveBlocker(accounts.length) === null

  const hasNoAccounts = !isPending && !isError && all.length === 0
  // Sin cuentas el saldo sigue siendo la suma de los movimientos: se muestra, así se ve lo que hay que repartir.
  const unassignedCents = hasNoAccounts && currentBalanceCents !== undefined && currentBalanceCents > 0 ? currentBalanceCents : 0

  function balanceOf(account: BalanceLocation): number {
    return balanceMap.get(account.id) ?? account.openingCents
  }

  function handleAction(account: BalanceLocation, id: AccountMenuActionId) {
    switch (id) {
      case 'adjust':
      case 'edit':
      case 'delete':
        setDialog({ kind: id, accountId: account.id })
        break
      case 'transfer':
        setDialog({ kind: 'transfer', fromAccountId: account.id })
        break
      case 'setDefault':
        actions.makeDefault(account)
        break
      case 'viewMovements':
        navigate('/movimientos', { state: movimientosDeCuentaState(account.id, format(new Date(), 'yyyy-MM-dd')) })
        break
      case 'archive':
        actions.archiveAccount(account, balanceOf(account))
        break
    }
  }

  const target = dialog && 'accountId' in dialog ? byId.get(dialog.accountId) : undefined
  const closeDialog = () => setDialog(null)

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb to="/ajustes" label="Ajustes" />

      <header className="mb-1">
        <h1 className="font-display text-figure font-semibold">Cuentas</h1>
        <p className="mt-2.5 max-w-[620px] text-[13px] leading-normal text-fg-secondary text-pretty">
          <span className="sm:hidden">Reajustá una cuenta cuando el saldo real no coincide.</span>
          <span className="hidden sm:inline">
            Con qué pagás cada movimiento. Reajustá una cuenta cuando el saldo real no coincide con el de la app.
          </span>
        </p>
      </header>

      {isError ? (
        <div className="rounded-panel bg-surface">
          <ErrorState onRetry={() => void refetch()} />
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-panel sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:h-auto" />
          <Skeleton className="h-40 rounded-panel" />
          <Skeleton className="h-40 rounded-panel" />
        </div>
      ) : hasNoAccounts ? (
        <div className="rounded-panel-sm bg-surface px-6 py-[30px] text-center sm:rounded-panel">
          <div className="flex justify-center">
            <Money cents={unassignedCents} size="display" tone="faint" />
          </div>
          <p className="mx-auto mt-3.5 max-w-[330px] text-[13px] leading-[1.55] text-fg-secondary text-pretty">
            {unassignedCents > 0
              ? 'Tu saldo todavía no está repartido en cuentas. Creá la primera con lo que tengas ahí; el resto queda guardado hasta que cargues las demás.'
              : 'Todavía no cargaste ninguna cuenta. Creá la primera con lo que tengas hoy y la app arranca desde ahí.'}
          </p>
          <Button className="mt-[18px]" onClick={() => setDialog({ kind: 'create' })} icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}>
            Nueva cuenta
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)]">
            <AccountTotalCard
              totalCents={totals.totalCents}
              isBalancePending={isBalancePending}
              composition={composition}
              canTransfer={accounts.length >= 2}
              onCreate={() => setDialog({ kind: 'create' })}
              onTransfer={() => setDialog({ kind: 'transfer', fromAccountId: '' })}
            />
  
            {accounts.map((account, index) => (
              <AccountCard
                key={account.id}
                account={account}
                balanceCents={balanceOf(account)}
                isBalancePending={isBalancePending}
                isDefault={account.id === defaultId}
                onAdjust={() => setDialog({ kind: 'adjust', accountId: account.id })}
                menu={
                  <AccountActionsMenu
                    accountName={account.name}
                    balanceCents={balanceOf(account)}
                    color={accountColor(index)}
                    isDefault={account.id === defaultId}
                    activeCount={accounts.length}
                    open={openMenuId === account.id}
                    onOpenChange={(open) => setOpenMenuId(open ? account.id : null)}
                    onAction={(id) => handleAction(account, id)}
                    onInverse={account.id === defaultId}
                  />
                }
              />
            ))}
          </div>
  
          {(archived.length > 0 || recentTransfers.length > 0) && (
            <div className="grid grid-flow-dense grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-[18px]">
              {archived.length > 0 && (
                <CollapsibleCell
                  label={`Archivadas (${archived.length})`}
                  note="no suman al total"
                  open={archivedOpen}
                  onToggle={() => setArchivedOpen((open) => !open)}
                >
                  <ArchivedAccountsList
                    accounts={archived}
                    balanceOf={balanceOf}
                    isBalancePending={isBalancePending}
                    onReactivate={actions.reactivateAccount}
                  />
                </CollapsibleCell>
              )}
  
              {recentTransfers.length > 0 && (
                <CollapsibleCell
                  label="Últimas transferencias"
                  open={transfersOpen}
                  onToggle={() => setTransfersOpen((open) => !open)}
                >
                  <RecentTransfersList
                    transfers={recentTransfers}
                    nameOf={(id) => byId.get(id)?.name || '?'}
                    onDelete={actions.removeTransfer}
                  />
                </CollapsibleCell>
              )}
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'create' && (
        <AccountFormDialog mode="create" onClose={closeDialog} />
      )}
      {dialog?.kind === 'edit' && target && (
        <AccountFormDialog
          mode="edit"
          onClose={closeDialog}
          account={target}
          balanceCents={balanceOf(target)}
          isDefault={target.id === defaultId}
          onDelete={() => setDialog({ kind: 'delete', accountId: target.id })}
        />
      )}
      {dialog?.kind === 'adjust' && target && (
        <AdjustBalanceDialog onClose={closeDialog} account={target} derivedCents={balanceOf(target)} />
      )}
      {dialog?.kind === 'transfer' && <TransferDialog onClose={closeDialog} fromAccountId={dialog.fromAccountId} />}
      {dialog?.kind === 'delete' && target && (
        <DeleteAccountDialog
          onClose={closeDialog}
          account={target}
          isLastAccount={all.length === 1}
          onArchive={
            !target.is_archived && canArchive
              ? async () => {
                  await archive.mutateAsync({ id: target.id, archived: true })
                  const { title, detail } = archiveResultText(target.name, balanceOf(target))
                  showToast(title, 'ok', { detail })
                  closeDialog()
                }
              : undefined
          }
          onConfirm={async () => {
            await deleteAccount.mutateAsync(target.id)
            showToast('Cuenta eliminada', 'ok', { detail: target.name })
            closeDialog()
          }}
        />
      )}
    </div>
  )
}
