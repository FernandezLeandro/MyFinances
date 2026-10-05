import { formatMoney } from '@/lib/money'
import { AccountSelect, AccountTriggerRow } from '@/features/accounts/AccountSelect'

/** Cuenta de la que sale (o a la que entra) la plata de un movimiento generado, con el «queda en $…»
 *  ya calculado — mismo campo que `MarkPaidDialog` de Fijos. `deltaCents` negativo = sale plata. */
export function AccountField({
  label,
  accountId,
  onChange,
  deltaCents,
}: {
  label: string
  accountId: string
  onChange: (id: string) => void
  deltaCents: number | null
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">{label}</p>
      <AccountSelect
        required
        value={accountId}
        onChange={onChange}
        trigger={(account) => (
          <AccountTriggerRow
            icon={account?.icon ?? <span aria-hidden className="size-10 shrink-0 rounded-control bg-fill-subtle" />}
            name={account?.name ?? 'Elegí una cuenta'}
            placeholder={!account}
            secondary={
              account && deltaCents != null && account.balanceCents !== undefined
                ? `queda en ${formatMoney(account.balanceCents + deltaCents)}`
                : undefined
            }
          />
        )}
        triggerClassName="flex h-[54px] w-full items-center gap-2.5 rounded-control border border-border-strong pr-3 pl-2 text-left text-fg transition-colors duration-150 hover:border-fg-faint"
      />
    </div>
  )
}
