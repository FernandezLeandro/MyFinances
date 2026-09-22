import { Money } from '@/components/ui/Money'
import type { Category } from '@/features/categories/api'
import type { Transaction } from '@/features/transactions/api'
import { movementCategoryLabel } from '@/features/transactions/aggregate'
import type { BalanceLocation } from '@/features/accounts/api'

export function TransactionRow({
  tx,
  category,
  account,
  onClick,
}: {
  tx: Transaction
  category?: Category
  /** Cuenta con la que se pagó (`tx.account_id`) — ausente cuando está "Sin asignar". */
  account?: BalanceLocation
  onClick?: () => void
}) {
  const income = tx.type === 'income'

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-chip px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? 'var(--color-border-strong)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg">
            {tx.description || category?.name || 'Sin descripción'}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-fg-muted">
            {movementCategoryLabel(tx, category?.name)}
            {account && ` · ${account.name || '(sin nombre)'}`}
          </p>
        </div>
        <Money
          cents={income ? tx.cents : -tx.cents}
          tone={income ? 'accent' : 'negative'}
          size="row"
          signed
          className="shrink-0"
        />
      </button>
    </li>
  )
}
