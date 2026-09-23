import { ChevronDown } from 'lucide-react'
import { HelpMarker } from '@/components/help/HelpMarker'
import { Money } from '@/components/ui/Money'
import { StackedBar } from '@/components/ui/StackedBar'
import { accountColor } from '@/features/accounts/aggregate'

// Los datos de la maqueta son de ejemplo y van fijos a propósito: explica la anatomía de la pantalla
// y tiene que verse igual para todos, nunca leer las cuentas de quien la mira.
const SAMPLE_SHARES = [
  { name: 'Efectivo', pct: 52 },
  { name: 'Galicia', pct: 31 },
  { name: 'Mercado Pago', pct: 17 },
]

const label = 'text-[10.5px] leading-none font-semibold tracking-[0.12em] uppercase'

/**
 * La pantalla de Cuentas en chico, con seis marcadores que la leyenda (`HelpLegend`) explica. Es una
 * maqueta, no la pantalla: los controles son `<div>`, no botones (nadie debería poder enfocarlos ni
 * tocarlos), y todo va `aria-hidden` porque la leyenda de abajo ya lo cuenta en texto.
 *
 * Usa los mismos componentes y tokens que la pantalla real (`Money`, `StackedBar`, `bg-inverse`), así
 * que sigue pareciéndose a ella en modo oscuro sin mantener una segunda paleta.
 */
export function AccountsHelpDiagram() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3 rounded-panel bg-surface p-5"
    >
      {/* Tarjeta del total: ① el total, ② la barra de qué está hecho. */}
      <div className="flex min-w-0 flex-col gap-2.5 rounded-panel-sm bg-surface-sunken p-[18px]">
        <div className="flex items-center gap-2">
          <HelpMarker n={1} />
          <span className={`${label} text-fg-muted`}>Total en tus cuentas</span>
        </div>
        <Money cents={48235000} size="account" />
        <div className="flex items-center gap-2">
          <HelpMarker n={2} />
          <StackedBar
            thin
            className="flex-1"
            segments={SAMPLE_SHARES.map((share, i) => ({ pct: share.pct, color: accountColor(i) }))}
          />
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-secondary">
          {SAMPLE_SHARES.map((share, i) => (
            <li key={share.name} className="flex items-center gap-1.5">
              <span className="size-[7px] shrink-0 rounded-pill" style={{ backgroundColor: accountColor(i) }} />
              {share.name} <span className="tnum">{share.pct}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {/* Cuenta predeterminada: ③ la tarjeta, ④ la acción principal, ⑤ el menú ⋯. */}
        <div className="rounded-panel-sm bg-inverse p-4 text-on-inverse">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HelpMarker n={3} tone="onInverse" />
              <span className={`${label} text-on-inverse-muted`}>Efectivo</span>
            </div>
            <span className="rounded-chip bg-inverse-divider px-[7px] py-[3px] text-[9.5px] leading-none font-semibold tracking-[0.06em]">
              PREDETERMINADA
            </span>
          </div>
          <p className="mt-3 text-sm font-semibold">Efectivo</p>
          <div className="mt-1">
            <Money cents={25000000} size="compact" tone="onInverse" />
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <HelpMarker n={4} tone="onInverse" />
            <div className="grid h-8 min-w-0 flex-1 place-items-center rounded-control border border-inverse-divider px-2 text-[12px] font-semibold">
              <span className="truncate">Reajustar saldo</span>
            </div>
            <HelpMarker n={5} tone="onInverse" />
            <div className="grid size-8 shrink-0 place-items-center rounded-item border border-inverse-divider text-[15px] leading-none text-on-inverse-secondary">
              ⋯
            </div>
          </div>
        </div>

        {/* ⑥ Lo que se despliega al tocarlo. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-panel-sm bg-surface-sunken px-4 py-3.5">
          <HelpMarker n={6} />
          <span className="text-[12.5px] text-fg-secondary">Archivadas (1)</span>
          <span className="text-[11.5px] text-fg-faint">no suman al total</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-fg-muted" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}
