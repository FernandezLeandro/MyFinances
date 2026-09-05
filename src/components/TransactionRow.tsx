import { Money } from '@/components/ui/Money'
import type { Category } from '@/features/categories/api'
import type { Transaction } from '@/features/transactions/api'
import type { BalanceLocation } from '@/features/reconciliation/api'

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
        className="flex w-full items-center gap-3 rounded-chip px-6 py-2.5 text-left transition-colors duration-150 hover:bg-ink-850"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? 'var(--color-ink-600)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-chalk">
            {tx.description || category?.name || 'Sin descripción'}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-chalk-faint">
            {tx.is_adjustment
              ? 'Ajuste de saldo · afuera de Análisis'
              : tx.is_credit_card_payment
                ? `${category?.name ?? 'Sin categoría'} · Tarjeta`
                : (category?.name ?? 'Sin categoría')}
            {account && ` · ${account.name || '(sin nombre)'}`}
          </p>
        </div>
        <Money cents={income ? tx.cents : -tx.cents} tone={income ? 'acid' : 'coral'} size="row" signed />
      </button>
    </li>
  )
}
