import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps {
  label: string
  /** Al lado del label, no del hint — para un `InfoTooltip` u otro adorno chiquito que tenga que
   *  quedar pegado al título del campo en vez de perdido debajo del control. */
  labelAddon?: ReactNode
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
  className?: string
}

/** Etiqueta + control + error. La etiqueta va en eyebrow: chiquita, en mayúsculas y fuera del campo. */
export function Field({ label, labelAddon, hint, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="eyebrow">
          {label}
        </label>
        {labelAddon}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] text-coral">{error}</p>
      ) : (
        hint && <p className="text-[12px] text-chalk-faint">{hint}</p>
      )}
    </div>
  )
}

export const controlBase =
  'w-full rounded-control bg-ink-850 px-3.5 text-chalk placeholder:text-chalk-faint ' +
  'transition-colors duration-150 outline-none ' +
  'hover:bg-ink-800 focus:bg-ink-800 disabled:opacity-40'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: Ref<HTMLInputElement> }

// React 19: una función puede recibir `ref` como prop normal, sin forwardRef. Hace falta que
// llegue al <input> real para que React Hook Form (no controlado) pueda leer el valor.
export function Input({ className, invalid, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, 'h-11 text-[15px]', invalid && 'ring-1 ring-coral/60', className)}
      {...props}
    />
  )
}

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

/**
 * Campo de importe: teclado numérico en el celular y tipografía display, porque es el dato que el
 * usuario mira mientras escribe. El parseo a centavos lo hace `parseAmountToCents` en el submit.
 */
export function AmountInput({ className, invalid, ref, ...props }: AmountInputProps) {
  const id = useId()
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-control bg-ink-850 pl-4 transition-colors duration-150',
        'focus-within:bg-ink-800',
        invalid && 'ring-1 ring-coral/60',
        className,
      )}
    >
      <label htmlFor={props.id ?? id} className="font-display text-2xl text-chalk-faint select-none">
        $
      </label>
      <input
        ref={ref}
        id={props.id ?? id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        aria-invalid={invalid || undefined}
        className="tnum h-14 w-full bg-transparent pr-4 font-display text-3xl font-semibold text-chalk outline-none placeholder:text-ink-600"
        {...props}
      />
    </div>
  )
}
