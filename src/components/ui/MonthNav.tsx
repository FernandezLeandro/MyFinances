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
 * breakpoint, no una sola que se achica: en escritorio son dos botones cuadrados chicos con flecha
 * alrededor del label (`‹ septiembre 2026 ›`); en mobile, una sola píldora `fill-subtle` con dos
 * botones circulares de 32px (objetivo táctil, no los 26px del escritorio) — el patrón que fija
 * `02 Movimientos.dc.html`. Presentacional puro: cada pantalla guarda el mes a su manera (string
 * `anchor` vs. `Date`), así que esto sólo recibe los labels ya formateados y dos callbacks.
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

      <div className="flex items-center gap-1 rounded-pill bg-fill-subtle p-px text-[13px] font-semibold text-fg lg:hidden">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Mes anterior"
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
        </button>
        <span className="px-0.5">{mobileLabel ?? label}</span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Mes siguiente"
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted"
        >
          <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </>
  )
}
