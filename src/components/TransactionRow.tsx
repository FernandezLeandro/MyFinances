import { cn } from '@/lib/cn'
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
  hidden,
  future,
}: {
  tx: Transaction
  category?: Category
  /** Cuenta con la que se pagó (`tx.account_id`) — ausente cuando está "Sin asignar". */
  account?: BalanceLocation
  onClick?: () => void
  /** HO-02 del QA de Hoy: con el ojo activado en la pantalla que la contiene, esta fila también
   *  tiene que enmascararse — antes quedaba visible aunque el resto de Hoy ya ocultaba todo. */
  hidden?: boolean
  /** HO-08 del QA de Hoy: `isFutureOccurredOn` — la fila se ve atenuada, esta plata todavía no
   *  salió (ni entró). El grupo del día ya avisa con su propio label ("Mañana"/"Programado · …"). */
  future?: boolean
}) {
  const income = tx.type === 'income'

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-chip px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle',
          future && 'opacity-60',
        )}
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
          hidden={hidden}
          className="shrink-0"
        />
      </button>
    </li>
  )
}
