import { ArrowLeftRight } from 'lucide-react'
import { Money } from '@/components/ui/Money'
import type { AccountTransfer } from '@/features/accounts/transfers-api'

/** Una transferencia entre cuentas en la lista de Movimientos (mobile) — hermana de `TransactionRow`,
 *  con la misma anatomía. No es gasto ni ingreso: en vez del punto de categoría lleva ⇄, y el importe
 *  va en gris. `signedCents` sale de `transferSignedCents`: 0 sin filtro de cuenta (va sin signo),
 *  negativo o positivo cuando se filtra por la cuenta de la que sale o a la que entra.
 *  `accountsLabel` sale de `transferAccountsLabel`. */
export function TransferRow({
  transfer,
  accountsLabel,
  signedCents,
  onClick,
}: {
  transfer: AccountTransfer
  accountsLabel: string
  signedCents: number
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-chip px-panel py-2.5 text-left transition-colors duration-150 hover:bg-fill-subtle"
      >
        {/* Del ancho del punto de `TransactionRow` (8px), así los textos quedan alineados entre filas. */}
        <span aria-hidden className="flex size-2 shrink-0 items-center justify-center">
          <ArrowLeftRight className="size-3 shrink-0 text-fg-muted" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg">{transfer.description || 'Transferencia'}</p>
          <p className="mt-0.5 truncate text-[12px] text-fg-muted">Transferencia · {accountsLabel}</p>
        </div>
        <Money
          cents={signedCents !== 0 ? signedCents : transfer.cents}
          tone="dim"
          size="row"
          signed={signedCents !== 0}
          className="shrink-0"
        />
      </button>
    </li>
  )
}
