import type { ReactNode } from 'react'
import { m } from 'motion/react'
import { cn } from '@/lib/cn'
import { EASE_OUT_QUINT } from '@/lib/motion'
import { Money } from '@/components/ui/Money'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
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
  animateIn = false,
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
  /** Fila recién cargada (Hoy): entra con un fundido corto para que se vea qué se agregó. Sólo
   *  opacidad y `y` — no cambia el alto, que Hoy mide para saber cuántas filas entran. Sin esto la
   *  fila es un `<li>` común: Movimientos lista cientos y no paga el costo de `m`. */
  animateIn?: boolean
}) {
  const income = tx.type === 'income'

  const content: ReactNode = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-chip px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle',
        future && 'opacity-60',
      )}
    >
      <CategoryChip size={28} {...chipLook(category, { adjustment: tx.is_adjustment })} />
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
  )

  return animateIn ? (
    <m.li initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE_OUT_QUINT }}>
      {content}
    </m.li>
  ) : (
    <li>{content}</li>
  )
}
