import { useState } from 'react'
import { Money } from '@/components/ui/Money'
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
    <div className="flex items-center gap-3 rounded-control px-1 py-2">
      <Icon className="size-4 shrink-0 text-chalk-faint" strokeWidth={1.5} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-chalk">{location.name || '(sin nombre)'}</p>
        <p className="text-[11px] text-chalk-faint">
          Según la app: <Money cents={derivedCents} tone="dim" size="inline" />
          {diff !== 0 && (
            <>
              {' · '}
              <span className={diff > 0 ? 'text-acid' : 'text-coral'}>
                {diff > 0 ? '+' : ''}
                {centsToInputText(diff)}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="w-28 shrink-0">
        <input
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          onBlur={saveAmount}
          inputMode="decimal"
          aria-label={`Real declarado en ${location.name || 'cuenta'}`}
          className="tnum h-10 w-full rounded-control bg-ink-850 px-3 text-right text-[14px] text-chalk transition-colors focus:bg-ink-800 focus:outline-none"
        />
      </div>
    </div>
  )
}
