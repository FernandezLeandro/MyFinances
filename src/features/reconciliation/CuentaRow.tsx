import { useState } from 'react'
import { cn } from '@/lib/cn'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useUpdateBalanceLocation, type BalanceLocation } from '@/features/reconciliation/api'
import { accountKindIcon } from '@/features/accounts/accountKind'

/**
 * Fila de cuenta en Cuadrar Saldo: nombre y tipo (de sólo lectura acá — se editan en
 * `CuentasManagerDialog`), el derivado ("Según la app") de sólo lectura, y el REAL declarado
 * (`amount`, editable, persiste `onBlur` como antes de este cambio) con su diferencia si no
 * coinciden. El nombre dejó de editarse inline porque ahora también hay tipo y apertura que
 * completar — un formulario completo (el manager) resuelve mejor esos tres campos juntos que tres
 * inputs sueltos acá.
 *
 * El campo del real declarado se tiñe según coincida o no con el derivado — mismo criterio que el
 * resto de las filas de estado de un diálogo-herramienta (arquetipo 4): `badge-red-bg` con desvío,
 * `fill-subtle` cuando coincide.
 */
export function CuentaRow({ location, derivedCents }: { location: BalanceLocation; derivedCents: number }) {
  const updateLocation = useUpdateBalanceLocation()
  const [amountInput, setAmountInput] = useState(() => centsToInputText(location.amountCents))
  const Icon = accountKindIcon(location.kind)
  const diff = location.amountCents - derivedCents

  function saveAmount() {
    const cents = parseAmountToCents(amountInput) ?? 0
    if (cents === location.amountCents) return
    updateLocation.mutate({ id: location.id, cents })
    setAmountInput(centsToInputText(cents))
  }

  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-fg">{location.name || '(sin nombre)'}</p>
        <p className={cn('mt-0.5 text-[11px] tnum', diff !== 0 ? 'text-negative' : 'text-fg-muted')}>
          Según la app: {centsToInputText(derivedCents)}
          {diff !== 0 && ` · ${diff > 0 ? '+' : ''}${centsToInputText(diff)}`}
        </p>
      </div>
      <input
        value={amountInput}
        onChange={(e) => setAmountInput(e.target.value)}
        onBlur={saveAmount}
        inputMode="decimal"
        aria-label={`Real declarado en ${location.name || 'cuenta'}`}
        className={cn(
          'tnum h-9 w-[104px] shrink-0 rounded-control px-3 text-right text-[13.5px] text-fg transition-colors outline-none',
          diff !== 0 ? 'bg-badge-red-bg' : 'bg-fill-subtle',
        )}
      />
    </div>
  )
}
