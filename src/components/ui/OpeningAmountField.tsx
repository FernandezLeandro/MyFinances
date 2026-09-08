import { useId } from 'react'
import { cn } from '@/lib/cn'

interface OpeningAmountFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  /** La explicación va al costado, en la misma línea que el campo — no debajo. Es lo que permite
   *  que el bloque entre en un renglón en vez de tres. */
  hint: string
  ariaLabel?: string
  className?: string
}

/**
 * El campo de apertura: 150px, el "$" adelante y los dígitos a la izquierda, con la explicación al
 * costado. Se usa en los tres lugares donde se declara plata que ya estaba — alta de cuenta,
 * edición de cuenta y el aporte de `SavingsEntryFormDialog`.
 *
 * No es el mismo campo que el real declarado de Cuadrar saldo, que va alineado a la derecha: ahí
 * hay una columna de montos comparables entre sí y el ojo los lee en vertical. Acá el monto está
 * solo, así que alinearlo a la derecha lo despega de su rótulo sin ganar nada.
 */
export function OpeningAmountField({
  value,
  onChange,
  label,
  hint,
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
            $
          </span>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
