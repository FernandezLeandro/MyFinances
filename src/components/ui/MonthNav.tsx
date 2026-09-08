import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthNavProps {
  /** Ya formateado, p.ej. "septiembre 2026" (`format(date, 'MMMM yyyy', { locale: es })`). */
  label: string
  /** Versión corta para la píldora de mobile, p.ej. "septiembre" (sin el año — no entra al lado
   *  del título en 390px). Si no se pasa, la píldora usa `label` tal cual. */
  mobileLabel?: string
  onPrev: () => void
  onNext: () => void
}

const arrowClass =
  'grid size-[26px] shrink-0 place-items-center rounded-[8px] border border-border-strong text-fg-muted ' +
  'transition-colors hover:bg-fill-subtle hover:text-fg'

/**
 * Header de mes compartido por Movimientos, Fijos, Mis Deudas y Análisis. Dos formas por
 * breakpoint, no una sola que se achica: en escritorio son dos botones cuadrados con flecha
 * alrededor del label (`‹ septiembre 2026 ›`); en mobile, una sola píldora `fill-subtle` con los
 * glifos `‹›` adentro, al lado del título — el patrón que ya fija `02 Movimientos.dc.html`.
 * Presentacional puro: cada pantalla guarda el mes a su manera (string `anchor` vs. `Date`), así
 * que esto sólo recibe los labels ya formateados y dos callbacks.
 */
export function MonthNav({ label, mobileLabel, onPrev, onNext }: MonthNavProps) {
  return (
    <>
      <div className="hidden items-center gap-2 lg:flex">
        <button type="button" onClick={onPrev} aria-label="Mes anterior" className={arrowClass}>
          <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
        <p className="eyebrow">{label}</p>
        <button type="button" onClick={onNext} aria-label="Mes siguiente" className={arrowClass}>
          <ChevronRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-pill bg-fill-subtle px-2.5 py-1.5 text-[11.5px] font-semibold text-fg lg:hidden">
        <button type="button" onClick={onPrev} aria-label="Mes anterior" className="text-fg-muted">
          ‹
        </button>
        {mobileLabel ?? label}
        <button type="button" onClick={onNext} aria-label="Mes siguiente" className="text-fg-muted">
          ›
        </button>
      </div>
    </>
  )
}
