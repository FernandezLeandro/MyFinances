import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { HelpMarker } from '@/components/help/HelpMarker'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { Money } from '@/components/ui/Money'
import { CategoryChip } from '@/features/categories/CategoryChip'

// Los datos de la maqueta son de ejemplo y van fijos a propósito: explica la anatomía de la pantalla
// y tiene que verse igual para todos, nunca leer los movimientos de quien la mira. Importes de 7 cifras
// a propósito: tienen que envolver bien en 320px.
const label = 'text-[10.5px] leading-none font-semibold tracking-[0.09em] uppercase text-fg-muted'

/**
 * La pantalla de Movimientos en chico, con cinco marcadores que la leyenda (`HelpLegend`) explica. Es una
 * maqueta, no la pantalla: los controles son `<div>`, no botones, y todo va `aria-hidden` porque la
 * leyenda de abajo ya lo cuenta en texto. Mismos componentes y tokens que la pantalla real.
 */
export function MovementsHelpDiagram() {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-panel bg-surface p-5">
      {/* ① El período. */}
      <div className="flex items-center gap-2">
        <HelpMarker n={1} />
        <div className="flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-1 text-[12.5px] font-semibold">
          <ChevronLeft className="size-3.5 text-fg-muted" strokeWidth={2} />
          <span className="px-1">Octubre 2026</span>
          <ChevronRight className="size-3.5 text-fg-muted" strokeWidth={2} />
        </div>
      </div>

      {/* ② El resumen. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel-sm bg-surface-sunken p-[18px]">
        <HelpMarker n={2} />
        <div>
          <p className={label}>Neto del período</p>
          <Money cents={123450000} tone="accent" size="compact" signed className="mt-1" />
        </div>
        <div>
          <p className={label}>Ingresos</p>
          <Money cents={250000000} tone="fg" size="compact" className="mt-1" />
        </div>
        <div>
          <p className={label}>Gastos</p>
          <Money cents={126550000} tone="negative" size="compact" className="mt-1" />
        </div>
      </div>

      {/* ③ Buscar y filtrar, ④ un filtro activo. */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <HelpMarker n={3} />
          <div className="flex h-9 min-w-[140px] flex-1 items-center gap-2 rounded-control bg-surface-sunken px-3 text-[12.5px] text-fg-faint">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
            Buscar movimientos
          </div>
          <div className="flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-[12.5px] font-semibold">
            <SlidersHorizontal className="size-3.5" strokeWidth={1.8} />
            Filtros
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HelpMarker n={4} />
          <div className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-border-strong bg-surface pr-2 pl-1.5 text-[13px] font-semibold">
            <CategoryChip size={20} color="#d97757" icon="shopping-cart" />
            Supermercado
            <X className="size-3.5 text-fg-muted" strokeWidth={2.4} />
          </div>
        </div>
      </div>

      {/* ⑤ Un día con su neto y dos filas. */}
      <div className="overflow-hidden rounded-panel-sm bg-surface-sunken">
        <div className="flex items-center gap-2 bg-divider-list px-4 py-2.5">
          <HelpMarker n={5} />
          <GroupHeader
            className="flex-1"
            label="Martes 6 de octubre"
            total={<Money cents={-8500000} tone="negative" signed />}
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <CategoryChip size={28} color="#d97757" icon="shopping-cart" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">Supermercado</span>
          <Money cents={-8500000} tone="negative" size="row" signed />
        </div>
        <div className="flex items-center gap-3 border-t border-divider-list px-4 py-2.5">
          <CategoryChip size={28} neutral="transfer" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">Transferencia</span>
          <Money cents={5000000} tone="dim" size="row" />
        </div>
      </div>
    </div>
  )
}
