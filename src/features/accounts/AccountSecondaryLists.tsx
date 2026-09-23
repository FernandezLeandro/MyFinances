import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { X } from 'lucide-react'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import type { BalanceLocation } from '@/features/accounts/api'
import { ACCOUNT_KIND_LABEL } from '@/features/accounts/accountKind'
import type { AccountTransfer } from '@/features/accounts/transfers-api'

/** El contenido de la celda "Archivadas": una fila por cuenta con su saldo (no suma al total hasta
 *  reactivarla) y "Reactivar". La fecha es `updated_at`: una archivada no se edita, así que es la de
 *  archivar. */
export function ArchivedAccountsList({
  accounts,
  balanceOf,
  isBalancePending,
  onReactivate,
}: {
  accounts: BalanceLocation[]
  balanceOf: (account: BalanceLocation) => number
  isBalancePending: boolean
  onReactivate: (account: BalanceLocation, balanceCents: number) => void
}) {
  return (
    <ul className="mt-3.5">
      {accounts.map((account) => (
        <li key={account.id} className="flex items-center gap-3 border-t border-divider-list py-3.5 first:mt-0">
          <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-fg-faint" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-fg-secondary">{account.name || '(sin nombre)'}</p>
            <p className="mt-[3px] text-[11.5px] text-fg-muted">
              {ACCOUNT_KIND_LABEL[account.kind]} · archivada el {format(parseISO(account.updated_at), "d 'de' MMMM", { locale: es })}
            </p>
          </div>
          {isBalancePending ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <Money cents={balanceOf(account)} size="row" tone={balanceOf(account) < 0 ? 'negative' : 'dim'} />
          )}
          <button
            type="button"
            onClick={() => onReactivate(account, balanceOf(account))}
            className="shrink-0 rounded-item border border-border-strong px-[11px] py-[7px] text-[11.5px] font-semibold text-fg transition-colors duration-150 hover:bg-fill-subtle max-sm:min-h-11"
          >
            Reactivar
          </button>
        </li>
      ))}
    </ul>
  )
}

/** El contenido de la celda "Últimas transferencias": las cinco más recientes (todas se ven en
 *  Movimientos), con la X que abre `TransferDetailDialog` para confirmar el borrado — deshacer el
 *  movimiento de plata puede dejar la cuenta destino en negativo, y el diálogo lo avisa. */
export function RecentTransfersList({
  transfers,
  nameOf,
  onDelete,
}: {
  transfers: AccountTransfer[]
  nameOf: (accountId: string) => string
  onDelete: (id: string) => void
}) {
  return (
    <ul className="mt-3.5">
      {transfers.map((t) => (
        <li key={t.id} className="flex items-center gap-3 border-t border-divider-list py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-fg-secondary">
              {nameOf(t.from_account_id)} → {nameOf(t.to_account_id)}
            </p>
            <p className="mt-[3px] text-[11.5px] text-fg-muted">
              {format(parseISO(t.occurred_on), "d 'de' MMMM", { locale: es })}
              {t.description ? ` · ${t.description}` : ''}
            </p>
          </div>
          <Money cents={t.cents} tone="dim" size="inline" />
          <button
            type="button"
            onClick={() => onDelete(t.id)}
            aria-label="Eliminar transferencia"
            className="shrink-0 rounded-item p-1.5 text-fg-muted transition-colors duration-150 hover:bg-fill-subtle hover:text-negative max-sm:p-3"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}
