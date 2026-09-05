import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthNavProps {
  /** Ya formateado, p.ej. "septiembre 2026" (`format(date, 'MMMM yyyy', { locale: es })`). */
  label: string
  onPrev: () => void
  onNext: () => void
}

const arrowClass =
  'grid size-[26px] shrink-0 place-items-center rounded-[8px] border border-ink-600 text-chalk-faint ' +
  'transition-colors hover:bg-ink-850 hover:text-chalk'

/**
 * Header "‹ mes › " compartido por Movimientos, Fijos, Mis Deudas y Análisis — antes era el mismo
 * markup copiado en cada página. Cada pantalla guarda el mes a su manera (string `anchor` vs.
 * `Date`), así que este componente es puramente presentacional: recibe el label ya formateado y
 * dos callbacks.
 */
export function MonthNav({ label, onPrev, onNext }: MonthNavProps) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrev} aria-label="Mes anterior" className={arrowClass}>
        <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
      <p className="eyebrow">{label}</p>
      <button type="button" onClick={onNext} aria-label="Mes siguiente" className={arrowClass}>
        <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  )
}
