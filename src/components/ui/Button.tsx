import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/button-styles'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Mutación en curso: el botón deja de aceptar clicks, muestra un spinner en lugar del ícono y
   *  baja la opacidad, pero conserva su color (no se ve "apagado"). El texto lo cambia el caller
   *  ("Reajustando…"). */
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', icon, loading = false, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={buttonClasses({ variant, size, className, loading })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span aria-hidden className="size-[13px] shrink-0 animate-spin rounded-full border-2 border-current/35 border-t-current" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
