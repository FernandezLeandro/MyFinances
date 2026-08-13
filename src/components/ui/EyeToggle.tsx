interface EyeToggleProps {
  hidden: boolean
  onToggle: () => void
  label?: string
  /** Para cuando un toggle general (ej. Ahorros entero) ya fuerza el ocultamiento — el
   *  individual queda visualmente inerte en vez de dar un click que no cambia nada. */
  disabled?: boolean
}

/** Botón "ojo" para el toggle de ocultar/mostrar saldo — mismo ícono tachado que un campo de
 *  contraseña, así el gesto es reconocible sin necesitar texto. */
export function EyeToggle({ hidden, onToggle, label = 'saldo', disabled = false }: EyeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={hidden ? `Mostrar ${label}` : `Ocultar ${label}`}
      aria-pressed={hidden}
      className="rounded-chip p-1 text-chalk-faint transition-colors hover:bg-ink-850 hover:text-chalk disabled:pointer-events-none disabled:opacity-40"
    >
      {hidden ? (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path
            d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M2.5 2.5l11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path
            d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )}
    </button>
  )
}
