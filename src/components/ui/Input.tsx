import { useId, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, ReactNode, Ref } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'
import { sanitizeAmountInput } from '@/lib/money'

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
        <p className="text-[12px] text-negative">{error}</p>
      ) : (
        hint && <p className="text-[12px] text-fg-muted">{hint}</p>
      )}
    </div>
  )
}

export const controlBase =
  'w-full rounded-control border border-border-strong bg-transparent px-3.5 text-fg placeholder:text-fg-muted ' +
  'transition-colors duration-150 outline-none ' +
  'focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:opacity-40'

/** Campo inválido: fondo y texto rojos suaves con borde `negative` — se lee como error aunque el
 *  mensaje no esté a la vista. `!` en cada clase: sin él, compite con el color de borde/fondo/anillo
 *  de `controlBase` en el mismo `cn()` y `cn()` no dedupea — el ganador quedaría a merced del orden
 *  en que Tailwind genera el CSS, no del orden en el string. */
export const invalidControl =
  'border-negative! bg-badge-red-bg! text-badge-red-fg! focus:border-negative! focus:ring-badge-red-bg!'

type InputSize = 'md' | 'auth'

const inputSizes: Record<InputSize, string> = {
  md: 'h-11 text-[15px]',
  // Los campos de las 5 pantallas de auth: 48px en mobile, bajando a los 44px de siempre desde `sm`.
  auth: 'h-12 text-[15px] sm:h-11',
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
  /** No confundir con el atributo nativo `size` (ancho en caracteres) — este es el alto del control. */
  fieldSize?: InputSize
}

// React 19: una función puede recibir `ref` como prop normal, sin forwardRef. Hace falta que
// llegue al <input> real para que React Hook Form (no controlado) pueda leer el valor.
export function Input({ className, invalid, fieldSize = 'md', ref, onChange, ...props }: InputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (props.inputMode === 'decimal') event.currentTarget.value = sanitizeAmountInput(event.currentTarget.value)
    onChange?.(event)
  }

  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, inputSizes[fieldSize], invalid && invalidControl, className)}
      onChange={handleChange}
      {...props}
    />
  )
}

type PasswordInputProps = Omit<InputProps, 'type'>

/**
 * Campo de contraseña con el ojo para ver/ocultar lo tipeado. El botón va dentro del control (de
 * ahí el padding derecho extra) y queda fuera del Tab: el orden natural es campo → submit.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-fg-muted transition-colors hover:text-fg"
      >
        {visible ? (
          <EyeOff className="size-4" strokeWidth={1.3} aria-hidden />
        ) : (
          <Eye className="size-4" strokeWidth={1.3} aria-hidden />
        )}
      </button>
    </div>
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
export function AmountInput({ className, invalid, ref, onChange, ...props }: AmountInputProps) {
  const id = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = sanitizeAmountInput(event.currentTarget.value)
    onChange?.(event)
  }

  return (
    <div
      className={cn(
        'flex h-[58px] items-center gap-2 rounded-[14px] border border-accent bg-transparent pl-[18px] ring-4 ring-accent-soft',
        'transition-colors duration-150',
        invalid && 'border-negative! bg-badge-red-bg! ring-badge-red-bg!',
        className,
      )}
    >
      <label htmlFor={props.id ?? id} className="font-display text-2xl text-fg-muted select-none">
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
        className={cn(
          'tnum h-full w-full bg-transparent pr-4 font-display text-3xl font-semibold outline-none placeholder:text-border-strong',
          invalid ? 'text-badge-red-fg!' : 'text-fg',
        )}
        onChange={handleChange}
        {...props}
      />
    </div>
  )
}
