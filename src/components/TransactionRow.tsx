import { Money } from '@/components/ui/Money'
import type { Category } from '@/features/categories/api'
import type { Transaction } from '@/features/transactions/api'

export function TransactionRow({ tx, category, onClick }: { tx: Transaction; category?: Category; onClick?: () => void }) {
  const income = tx.type === 'income'

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-chip px-6 py-3 text-left transition-colors duration-150 hover:bg-ink-850"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? 'var(--color-ink-600)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-chalk">{tx.description || category?.name || 'Sin descripción'}</p>
          <p className="mt-0.5 text-[12px] text-chalk-faint">{category?.name ?? 'Sin categoría'}</p>
        </div>
        <Money cents={income ? tx.cents : -tx.cents} tone={income ? 'acid' : 'coral'} signed />
      </button>
    </li>
  )
}
