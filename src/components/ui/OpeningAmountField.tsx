import { useId } from 'react'
import { cn } from '@/lib/cn'
import { sanitizeAmountInput } from '@/lib/money'

interface OpeningAmountFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  /** La explicación va al costado, en la misma línea que el campo — no debajo. Es lo que permite
   *  que el bloque entre en un renglón en vez de tres. */
  hint: string
  /** "$" por default. El aporte de `SavingsEntryFormDialog` lo pisa con el símbolo del activo
   *  elegido (USD, BTC…) — ahí el campo no siempre declara pesos. */
  symbol?: string
  ariaLabel?: string
  className?: string
}

/**
 * El campo de apertura: 150px, el "$" adelante y los dígitos a la izquierda, con la explicación al
 * costado. Se usa en los tres lugares donde se declara plata que ya estaba — alta de cuenta,
 * edición de cuenta y el aporte de `SavingsEntryFormDialog`.
 *
 * Va con los dígitos a la izquierda y no alineado a la derecha: una columna de montos comparables
 * entre sí se lee en vertical y pide alineación a la derecha, pero acá el monto está solo, así que
 * alinearlo a la derecha lo despega de su rótulo sin ganar nada.
 */
export function OpeningAmountField({
  value,
  onChange,
  label,
  hint,
  symbol = '$',
  ariaLabel,
  className,
}: OpeningAmountFieldProps) {
  const id = useId()

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex h-10 w-[150px] shrink-0 items-center gap-1.5 rounded-control bg-fill-subtle px-3">
          <span aria-hidden className="text-[14px] text-fg-muted">
            {symbol}
          </span>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(sanitizeAmountInput(e.target.value, { allowNegative: true }))}
            inputMode="decimal"
            aria-label={ariaLabel ?? label}
            className="tnum min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none"
          />
        </div>
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-fg-muted">{hint}</p>
      </div>
    </div>
  )
}
