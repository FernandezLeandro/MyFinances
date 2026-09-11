interface BrandProps {
  className?: string
  /** `false` apaga el arco de acento a gris — usado en `tone="admin"` de `TopBar`, donde ese azul
   *  ("plata que es tuya") no aplica. */
  accent?: boolean
}

/**
 * Símbolo de marca de MyFinances ("anillo partido"): dos arcos concéntricos, uno de acento y uno
 * neutro. Se dibuja inline con los tokens de tema en vez de importar el `.svg` de `public/` para
 * que siga el `data-theme` de la app sola — un `<img src>` no puede heredar `currentColor`/vars.
 * Mismo dibujo que `icon-dark.svg`/`icon-light.svg` (el favicon), sin el cuadro de fondo.
 */
export function Brand({ className, accent = true }: BrandProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className} fill="none">
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke={accent ? 'var(--color-accent)' : 'var(--color-fg-faint)'}
        strokeWidth="7"
        strokeDasharray="40 67"
        transform="rotate(-90 32 32)"
      />
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke="var(--color-fg-faint)"
        strokeWidth="7"
        strokeDasharray="59 48"
        transform="rotate(58 32 32)"
      />
    </svg>
  )
}
