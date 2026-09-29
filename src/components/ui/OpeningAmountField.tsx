import { useId } from 'react'
import { cn } from '@/lib/cn'
import { sanitizeAmountInput } from '@/lib/money'
import { invalidControl } from '@/components/ui/Input'

interface OpeningAmountFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  /** La explicación va al costado, en la misma línea que el campo — no debajo. Es lo que permite
   *  que el bloque entre en un renglón en vez de tres. */
  hint?: string
  /** Por default el campo acepta negativos (un banco en descubierto es plata real). Un importe que
   *  siempre es positivo — el de una transferencia — lo apaga. */
  allowNegative?: boolean
  /** Un error de ESTE campo (patrón 5b): ocupa el lugar de la ayuda, al costado, y tiñe el campo de
   *  rojo. Un error de guardado, en cambio, no va acá sino en un bloque arriba del pie. */
  error?: string
  /** "$" por default. El aporte de `SavingsEntryFormDialog` lo pisa con el símbolo del activo
   *  elegido (USD, BTC…) — ahí el campo no siempre declara pesos. */
  symbol?: string
  /** Botón "MÁX." pegado al campo: rellena el importe con el tope que corresponda (el saldo de la
   *  cuenta de la que sale la plata). Sin esta prop no se dibuja. `title` dice cuánto es. */
  onMax?: () => void
  maxTitle?: string
  ariaLabel?: string
  className?: string
  /** El cursor arranca en el campo al abrir — la bolsa de Pagar fijo, donde cada carga es un importe
   *  distinto y hay algo para escribir de una. */
  autoFocus?: boolean
  /** `sm` (default): campo compacto de 170px, con el hint al costado — alta/edición de cuenta,
   *  aporte de Ahorros. `lg`: cifra grande a todo el ancho, subrayada en acento, con el hint debajo
   *  — el «¿Cuánto tenés de verdad?» de Reajustar saldo (rediseño de modales v2, opción B), la única
   *  cifra que se mira mientras se escribe. */
  size?: 'sm' | 'lg'
  /** Sólo con `size="lg"`. `start` (default): como Reajustar saldo, ocupa todo el ancho. `center`:
   *  label y cifra centrados, el input mide su propio ancho — Nueva cuenta y Pagar fijo. */
  align?: 'start' | 'center'
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
  allowNegative = true,
  error,
  symbol = '$',
  onMax,
  maxTitle,
  ariaLabel,
  className,
  autoFocus,
  size = 'sm',
  align = 'start',
}: OpeningAmountFieldProps) {
  const id = useId()

  if (size === 'lg') {
    const centered = align === 'center'
    return (
      <div className={cn('flex flex-col gap-1.5', centered && 'items-center text-center', className)}>
        <label htmlFor={id} className="text-[12.5px] font-medium text-fg-secondary">
          {label}
        </label>
        <div
          className={cn(
            'flex items-baseline gap-2 border-b-2 pb-2',
            centered && 'justify-center px-2',
            error ? 'border-negative' : 'border-accent',
          )}
        >
          <span aria-hidden className={cn('font-display text-[26px] font-medium', error ? 'text-badge-red-fg' : 'text-fg-muted')}>
            {symbol}
          </span>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(sanitizeAmountInput(e.target.value, { allowNegative }))}
            inputMode="decimal"
            autoFocus={autoFocus}
            // Centrado: el input mide su propio ancho (atributo nativo `size`, en caracteres) en vez
            // de estirarse — así la cifra queda centrada de verdad y no pegada a la izquierda de una
            // fila que ocupa todo el ancho del diálogo.
            size={centered ? Math.max(value.length, 1) : undefined}
            aria-label={ariaLabel ?? label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              'tnum min-w-0 max-w-full bg-transparent font-display text-[40px] leading-tight font-semibold tracking-[-0.04em] outline-none',
              centered ? 'flex-none text-center' : 'flex-1',
              error ? 'text-badge-red-fg!' : 'text-fg',
            )}
          />
        </div>
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className={cn('text-[12.5px] leading-snug font-medium text-badge-red-fg', centered && 'text-center')}
          >
            {error}
          </p>
        ) : (
          hint && <p className={cn('text-[12px] leading-snug text-fg-muted', centered && 'text-center')}>{hint}</p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div
          className={cn(
            'flex h-10 w-[170px] shrink-0 items-center gap-1.5 rounded-control bg-fill-subtle px-3',
            error && invalidControl,
          )}
        >
          <span aria-hidden className={cn('text-[14px]', error ? 'text-badge-red-fg' : 'text-fg-muted')}>
            {symbol}
          </span>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(sanitizeAmountInput(e.target.value, { allowNegative }))}
            inputMode="decimal"
            aria-label={ariaLabel ?? label}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn('tnum min-w-0 flex-1 bg-transparent text-[14px] outline-none', error ? 'text-badge-red-fg' : 'text-fg')}
          />
        </div>
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            title={maxTitle}
            aria-label={maxTitle ? `Usar el máximo: ${maxTitle}` : 'Usar el máximo'}
            className="h-10 shrink-0 rounded-control border border-border px-3 text-[12px] font-bold tracking-wide text-accent-text hover:bg-accent-soft"
          >
            MÁX.
          </button>
        )}
        {/* Con el botón al lado el texto casi no entra en el celular: en vez de apretarse a 100px,
            pasa a la línea de abajo (la base de 12rem es lo que dispara el salto). */}
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className={cn(
              'min-w-0 text-[12.5px] leading-snug font-medium text-badge-red-fg',
              onMax ? 'flex-[1_1_12rem]' : 'flex-1',
            )}
          >
            {error}
          </p>
        ) : (
          hint && (
            <p className={cn('min-w-0 text-[12px] leading-snug text-fg-muted', onMax ? 'flex-[1_1_12rem]' : 'flex-1')}>{hint}</p>
          )
        )}
      </div>
    </div>
  )
}
