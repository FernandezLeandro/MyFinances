import { Link } from 'react-router'
import { ChevronLeft } from 'lucide-react'

/**
 * La miga de una pantalla que cuelga de otra: "‹ AJUSTES". Es un enlace al padre, no un "volver":
 * a Cuentas se llega también desde Hoy, y la miga dice a dónde pertenece la pantalla, no de dónde
 * se vino. Va arriba del título, sobre el mismo eyebrow que el resto de los rótulos.
 */
export function PageBreadcrumb({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="eyebrow inline-flex items-center gap-1.5 self-start transition-colors duration-150 hover:text-fg"
    >
      <ChevronLeft className="size-3 shrink-0" strokeWidth={1.8} aria-hidden />
      {label}
    </Link>
  )
}
