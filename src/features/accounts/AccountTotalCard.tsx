import { Plus } from 'lucide-react'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'
import { StackedBar } from '@/components/ui/StackedBar'
import { Button } from '@/components/ui/Button'
import { formatShare, totalFigureSize, type CompositionSlice } from '@/features/accounts/aggregate'

interface AccountTotalCardProps {
  totalCents: number
  isBalancePending: boolean
  composition: CompositionSlice[]
  canTransfer: boolean
  onCreate: () => void
  onTransfer: () => void
}

/**
 * El total en tus cuentas — el saldo actual de la app, que es la suma de las cuentas activas (una
 * archivada no suma). Debajo, de qué está hecho, y al pie las dos acciones de la pantalla:
 * "Nueva cuenta" arriba y "Transferir entre cuentas" abajo, apiladas.
 *
 * La cifra: en escritorio ocupa una columna de 340px, donde el `total` de 46px fijos sólo entra hasta
 * 7 dígitos (`totalFigureSize`); en el celular va siempre la `figure`, que se achica sola.
 */
export function AccountTotalCard({
  totalCents,
  isBalancePending,
  composition,
  canTransfer,
  onCreate,
  onTransfer,
}: AccountTotalCardProps) {
  return (
    <div className="flex flex-col rounded-panel-sm bg-surface p-5 sm:col-span-2 sm:rounded-panel sm:p-6 lg:col-span-1 lg:row-span-2 lg:px-7 lg:py-[26px]">
      <p className="eyebrow">Total en tus cuentas</p>

      <div className="mt-3.5">
        {isBalancePending ? (
          <Skeleton className="h-9 w-48 lg:h-11" />
        ) : (
          <>
            <div className="lg:hidden">
              <Money cents={totalCents} size="figure" />
            </div>
            <div className="hidden lg:block">
              <Money cents={totalCents} size={totalFigureSize(totalCents)} />
            </div>
          </>
        )}
      </div>

      <p className="mt-3 text-[12.5px] leading-normal text-fg-secondary text-pretty">
        Es tu saldo actual: la suma de todas tus cuentas activas.
      </p>

      <StackedBar
        thin
        className="mt-5 lg:mt-6"
        segments={composition.map((slice) => ({ pct: slice.pct, color: slice.color }))}
      />
      {composition.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] text-fg-secondary">
          {composition.map((slice) => (
            <li key={slice.id} className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="max-w-[10rem] truncate">{slice.name || '(sin nombre)'}</span>
              <span className="tnum shrink-0">{formatShare(slice.pct)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* `outline` no define peso (sólo `primary` es semibold); el handoff pide 600 en los dos botones. */}
      <div className="mt-6 flex flex-col gap-2 lg:mt-auto lg:pt-7">
        <Button size="block" onClick={onCreate} icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />}>
          Nueva cuenta
        </Button>
        {canTransfer && (
          <Button size="block" variant="outline" onClick={onTransfer} className="font-semibold">
            Transferir entre cuentas
          </Button>
        )}
      </div>
    </div>
  )
}
