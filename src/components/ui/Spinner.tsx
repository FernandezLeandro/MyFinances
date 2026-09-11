import { cn } from '@/lib/cn'

/**
 * Reusa el dibujo del símbolo de marca (ver `Brand`) girando, en vez de un arco genérico — mismos
 * dos arcos concéntricos, con `currentColor` para que el caller siga eligiendo el color entero
 * (`text-accent`) en vez de un color de acento fijo adentro. El default sube de 16px (`size-4`) a
 * 40px (`size-10`): en los overlays donde se usa (`MutationLockOverlay`, `Dialog`) el chico se
 * perdía.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-10 animate-spin', className)} aria-hidden fill="none">
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="7"
        strokeDasharray="59 48"
        transform="rotate(58 32 32)"
      />
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke="currentColor"
        strokeWidth="7"
        strokeDasharray="40 67"
        transform="rotate(-90 32 32)"
      />
    </svg>
  )
}
