import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { FieldButton } from '@/components/ui/FieldButton'
import { FloatingPanel, InDialogSheet } from '@/components/ui/FloatingPanel'
import { useAccountBalances, useBalanceLocations, type AccountKind } from '@/features/accounts/api'
import { accountSelectGroups } from '@/features/accounts/aggregate'
import { ACCOUNT_KIND_LABEL, accountKindIcon } from '@/features/accounts/accountKind'

interface AccountSelectProps {
  /** Va en el botón, para el `htmlFor` del `Field` de arriba. */
  id?: string
  value: string
  onChange: (accountId: string) => void
  /** Sin la opción vacía: hay que elegir una cuenta (todo movimiento nuevo la lleva). Con `''` el
   *  botón muestra "Elegí una cuenta", que no es una opción de la lista. */
  required?: boolean
  /** Etiqueta de la opción vacía cuando NO es `required`. */
  emptyLabel?: string
  /** Saldo de cada cuenta. Sin pasarlo se lee de `useAccountBalances` — el mismo dato; el form de
   *  movimiento ya lo tiene a mano para otras cuentas y lo reusa. */
  balances?: ReadonlyMap<string, number>
  /** Contenido propio del botón en vez del campo de siempre — las tarjetas «Sale de» / «Entra a» de
   *  Transferir. Recibe la cuenta elegida (o `null`) con su ícono ya armado. */
  trigger?: (selected: { name: string; balanceCents: number | undefined; icon: ReactNode } | null) => ReactNode
  /** Clases del botón cuando hay `trigger` (el borde y el fondo los pone quien lo usa). */
  triggerClassName?: string
}

type Option = { id: string; name: string; kind: AccountKind | null; archived: boolean }

function KindIcon({ kind, className }: { kind: AccountKind | null; className: string }) {
  const Icon = accountKindIcon(kind ?? 'cash')
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-control bg-fill-subtle text-fg-secondary', className)}>
      <Icon className="size-[18px]" strokeWidth={1.8} />
    </span>
  )
}

/**
 * Selector de cuenta de todos los diálogos (movimiento, transferir, pagos de Fijos/Créditos/Me
 * Deben, alta de cuenta). Rediseño de modales v2: desplegable propio en vez del `<select>` nativo —
 * el nativo no muestra ícono ni saldo en columna aparte. En escritorio abre un popover anclado; en
 * mobile, una hoja desde abajo dentro del diálogo (el picker nativo del sistema tapaba todo y no
 * dejaba ver el saldo). Una cuenta archivada sólo aparece si es la elegida ("archivada"): al editar
 * un movimiento que ya la tenía, no puede desaparecer ni pisarse sin querer al guardar.
 */
export function AccountSelect({
  id,
  value,
  onChange,
  required = false,
  emptyLabel = 'Sin cuenta',
  balances,
  trigger,
  triggerClassName,
}: AccountSelectProps) {
  const { data: locations } = useBalanceLocations()
  const { data: fetchedBalances } = useAccountBalances()
  const balanceOf = balances ?? fetchedBalances
  const isWide = useMediaQuery('(min-width: 640px)')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const options: Option[] = accountSelectGroups(locations ?? [], value).flatMap((g) =>
    g.accounts.map((a) => ({ id: a.id, name: a.name || '(sin nombre)', kind: g.kind, archived: a.archived })),
  )
  if (!required) options.unshift({ id: '', name: emptyLabel, kind: null, archived: false })
  const selected = options.find((o) => o.id === value) ?? null
  const balanceText = (accountId: string) =>
    accountId && balanceOf?.has(accountId) ? formatMoney(balanceOf.get(accountId)!) : null

  function pick(next: string) {
    onChange(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const list = (
    <ul role="listbox" aria-label="Cuenta" className={cn('flex flex-col gap-0.5', isWide && 'overflow-y-auto p-1.5')}>
      {options.map((o) => {
        const isSelected = o.id === value
        const balance = balanceText(o.id)
        const kindText = o.kind ? ACCOUNT_KIND_LABEL[o.kind] + (o.archived ? ' · archivada' : '') : null
        return (
          <li key={o.id || 'none'} role="option" aria-selected={isSelected}>
            <button
              type="button"
              onClick={() => pick(o.id)}
              className={cn(
                'flex w-full items-center text-left text-fg',
                isWide ? 'h-[52px] gap-2.5 rounded-item pr-2.5 pl-1.5' : 'h-[60px] gap-3 rounded-control pr-3 pl-2',
                isSelected ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
              )}
            >
              <KindIcon kind={o.kind} className={isWide ? 'size-[34px]' : 'size-10'} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate font-semibold', isWide ? 'text-[14px]' : 'text-[15px]')}>{o.name}</span>
                {isWide
                  ? kindText && <span className="text-[12px] text-fg-secondary">{kindText}</span>
                  : (kindText || balance) && (
                      <span className="text-[12.5px] text-fg-secondary tabular-nums">
                        {[kindText, balance].filter(Boolean).join(' · ')}
                      </span>
                    )}
              </span>
              {isWide && balance && <span className="text-[13.5px] font-semibold tabular-nums">{balance}</span>}
              {isWide ? (
                <Check className={cn('size-4 shrink-0', !isSelected && 'invisible')} strokeWidth={2.6} aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'grid size-[22px] shrink-0 place-items-center rounded-full',
                    isSelected ? 'bg-fg text-surface' : 'border-[1.5px] border-border-strong',
                  )}
                >
                  {isSelected && <Check className="size-3" strokeWidth={3.5} />}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )

  const selectedBalance = selected ? balanceText(selected.id) : null
  const Icon = accountKindIcon(selected?.kind ?? 'cash')

  return (
    <div className="relative">
      {trigger ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn('w-full text-left text-fg', triggerClassName)}
        >
          {trigger(
            selected && selected.id
              ? {
                  name: selected.name,
                  balanceCents: balanceOf?.get(selected.id),
                  icon: <KindIcon kind={selected.kind} className="size-10" />,
                }
              : null,
          )}
        </button>
      ) : (
        <FieldButton
          ref={triggerRef}
          id={id}
          open={open}
          onClick={() => setOpen((v) => !v)}
          icon={<Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />}
          label={selected ? selected.name + (selected.archived ? ' (archivada)' : '') : 'Elegí una cuenta'}
          placeholder={!selected}
          value={selectedBalance ?? undefined}
        />
      )}
      {isWide ? (
        <FloatingPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef}>
          {list}
        </FloatingPanel>
      ) : (
        <InDialogSheet open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} title="Elegí la cuenta">
          {list}
        </InDialogSheet>
      )}
    </div>
  )
}

/**
 * Contenido para un `trigger` de `AccountSelect` con el mismo look que su fila por defecto, pero el
 * dato chico va DEBAJO del nombre en vez de a la derecha — el "queda en $X" de Pagar fijo y de
 * Nueva cuenta ("Sale de"). Quien llama pone el botón que lo envuelve (`triggerClassName`); `icon`
 * ya viene armado (el `icon` que entrega `trigger`, o el propio con `KindIcon`).
 */
export function AccountTriggerRow({
  icon,
  name,
  secondary,
  placeholder,
}: {
  icon: ReactNode
  name: string
  secondary?: ReactNode
  placeholder?: boolean
}) {
  return (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-[14.5px] font-semibold', placeholder && 'font-medium text-fg-muted')}>{name}</span>
        {secondary && <span className="truncate text-[12px] text-fg-secondary tabular-nums">{secondary}</span>}
      </span>
      <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
    </>
  )
}
