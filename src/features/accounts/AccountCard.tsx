import type { ReactNode } from 'react'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/lib/cn'
import type { BalanceLocation } from '@/features/accounts/api'
import { ACCOUNT_KIND_LABEL } from '@/features/accounts/accountKind'

interface AccountCardProps {
  account: BalanceLocation
  balanceCents: number
  isBalancePending: boolean
  /** La predeterminada es la tarjeta oscura — reemplaza a la estrella de la versión anterior. */
  isDefault: boolean
  onAdjust: () => void
  /** El menú `⋯` (ya armado por quien la usa). */
  menu: ReactNode
}

/**
 * Una cuenta: el tipo como eyebrow, el nombre, el saldo y, al pie, la acción principal ("Reajustar
 * saldo") con el menú `⋯` al lado. Sin sombra ni borde — la separación es por color de superficie.
 *
 * En el celular la cifra y las acciones comparten renglón (el botón dice "Reajustar" a secas) y la
 * tarjeta baja a 16px de radio; desde `sm`, la cifra va arriba y las acciones al pie, a todo el ancho.
 */
export function AccountCard({ account, balanceCents, isBalancePending, isDefault, onAdjust, menu }: AccountCardProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-panel-sm px-[18px] py-4 sm:rounded-panel sm:px-6 sm:py-[22px]',
        isDefault ? 'bg-inverse text-on-inverse' : 'bg-surface text-fg',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn('eyebrow', isDefault && 'text-on-inverse-muted')}>{ACCOUNT_KIND_LABEL[account.kind]}</p>
        {isDefault && (
          <span
            aria-label="Cuenta predeterminada"
            className="rounded-chip bg-inverse-divider px-[7px] py-[3px] text-[10px] leading-none font-semibold tracking-[0.06em] text-on-inverse"
          >
            <span className="sm:hidden">PREDET.</span>
            <span className="hidden sm:inline">PREDETERMINADA</span>
          </span>
        )}
      </div>

      <p className="mt-2.5 truncate text-[15px] font-semibold sm:mt-3.5 sm:text-[17px]">{account.name || '(sin nombre)'}</p>

      {/* Celular: cifra y acciones en un renglón, pero si la cifra es larga (7+ cifras) las acciones
          bajan a su propio renglón en vez de pisarla — `flex-wrap` lo resuelve sin medir nada. */}
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-2.5 gap-y-3 sm:mt-2 sm:flex-1 sm:flex-col sm:flex-nowrap sm:items-stretch sm:justify-between sm:gap-5">
        <div className="max-w-full min-w-0">
          {isBalancePending ? (
            <Skeleton className={cn('h-[26px] w-32', isDefault && 'bg-inverse-divider')} />
          ) : (
            <Money
              cents={balanceCents}
              size="figure"
              tone={balanceCents < 0 ? (isDefault ? 'negativeOnInverse' : 'negative') : isDefault ? 'onInverse' : 'fg'}
            />
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:gap-2.5">
          <button
            type="button"
            onClick={onAdjust}
            className={cn(
              isDefault
                ? 'inline-flex items-center justify-center rounded-control border border-inverse-divider whitespace-nowrap text-on-inverse transition-colors duration-150 hover:bg-inverse-divider'
                : buttonClasses({ variant: 'outline' }),
              'h-11 px-3 text-[12px] font-semibold sm:h-[38px] sm:flex-1 sm:px-3.5 sm:text-[12.5px]',
            )}
          >
            <span className="sm:hidden">Reajustar</span>
            <span className="hidden sm:inline">Reajustar saldo</span>
          </button>
          {menu}
        </div>
      </div>
    </div>
  )
}
