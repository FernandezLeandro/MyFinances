import { Plus } from 'lucide-react'
import { HelpMarker } from '@/components/help/HelpMarker'
import { Badge } from '@/components/ui/Badge'
import { MiniProgress } from '@/components/ui/MiniProgress'
import { Money } from '@/components/ui/Money'
import { CategoryChip } from '@/features/categories/CategoryChip'

// Los datos de la maqueta son de ejemplo y van fijos a propósito: explica la anatomía de la pantalla
// y tiene que verse igual para todos, nunca leer los fijos de quien la mira. Importes de 7 cifras a
// propósito: tienen que envolver bien en 320px.
const label = 'text-[10.5px] leading-none font-semibold tracking-[0.09em] uppercase'

/**
 * La pantalla de Fijos en chico, con cinco marcadores que la leyenda (`HelpLegend`) explica. Es una
 * maqueta, no la pantalla: los controles son `<div>`, no botones, y todo va `aria-hidden` porque la
 * leyenda de abajo ya lo cuenta en texto. Mismos componentes y tokens que la pantalla real; el saldo
 * proyectado es una tarjeta `bg-inverse` propia y no `SaldoProyectadoPanel`, que trae lógica.
 */
export function FixedHelpDiagram() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-3 rounded-panel bg-surface p-5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {/* ① Falta pagar. */}
        <div className="flex flex-col gap-2.5 rounded-panel-sm bg-surface-sunken p-[18px]">
          <div className="flex items-center gap-2">
            <HelpMarker n={1} />
            <span className={`${label} text-fg-muted`}>Falta pagar</span>
          </div>
          <Money cents={184500000} size="compact" />
          <MiniProgress pct={60} tone="accent" size="bar" />
        </div>

        {/* ② Un grupo por vencimiento, ③ el casillero de un fijo de una vez, ④ un recurrente. */}
        <div className="overflow-hidden rounded-panel-sm bg-surface-sunken">
          <div className="flex items-center gap-2 border-b border-divider px-4 pt-3.5 pb-2">
            <HelpMarker n={2} />
            <span className="font-display text-[13.5px] font-semibold">Esta semana</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-3 sm:px-4">
            <HelpMarker n={3} />
            <span className="size-5 shrink-0 rounded-[5px] border border-border-strong" />
            <CategoryChip size={28} color="#5b8def" icon="wifi" className="max-[359px]:hidden" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">Internet</span>
            <Badge variant="amber" className="shrink-0 whitespace-nowrap max-[379px]:hidden">
              Vence el 9
            </Badge>
            <Money cents={4200000} size="row" />
          </div>
          <div className="flex items-center gap-2.5 border-t border-divider-list px-3 py-3 sm:px-4">
            <HelpMarker n={4} />
            <span className="grid size-5 shrink-0 place-items-center rounded-[5px] border border-border-strong text-fg-muted">
              <Plus className="size-2.5" strokeWidth={1.5} />
            </span>
            <CategoryChip size={28} color="#d97757" icon="car" className="max-[359px]:hidden" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">Nafta</p>
              <MiniProgress pct={45} tone="muted" size="inline" className="mt-1" />
            </div>
            <Money cents={11000000} size="row" />
          </div>
        </div>
      </div>

      {/* ⑤ Saldo proyectado. */}
      <div className="flex min-w-0 flex-col gap-2.5 self-start rounded-panel-sm bg-inverse p-[18px] text-on-inverse">
        <div className="flex items-center gap-2">
          <HelpMarker n={5} tone="onInverse" />
          <span className={`${label} text-on-inverse-muted`}>Saldo proyectado</span>
        </div>
        <Money cents={315500000} size="compact" tone="onInverse" />
        <dl className="mt-1 flex flex-col gap-1.5 text-[12px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-on-inverse-secondary">Saldo actual</dt>
            <dd>
              <Money cents={500000000} size="row" tone="onInverse" />
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-on-inverse-secondary">Fijos por pagar</dt>
            <dd>
              <Money cents={-184500000} size="row" tone="negativeOnInverse" signed />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
