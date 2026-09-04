import { Panel } from '@/components/ui/Panel'
import { Money } from '@/components/ui/Money'
import { Skeleton } from '@/components/ui/Skeleton'

interface SaldoProyectadoPanelProps {
  projectedCents: number | undefined
  isPending: boolean
  currentBalanceCents: number
  pendingFixedCount: number
  pendingFixedCents: number
  /** Tarjetas + compras sueltas impagas de este período (ver `summarizeMisDeudas`). */
  unpaidDebtsCount: number
  unpaidDebtsCents: number
  hidden: boolean
  /** Hoy oculta el panel entero cuando no hay nada que descontar (redundante con el hero de
   *  arriba); Fijos lo deja siempre visible con una línea aclaratoria. */
  hideWhenNothingPending?: boolean
}

/**
 * Panel compartido entre Hoy y Fijos (antes ~35 líneas duplicadas en cada página): el desglose de
 * los términos que `rpc_projected_balance` descuenta del saldo actual — fijos pendientes (bolsas
 * mensuales incluidas) y deudas impagas (tarjetas y compras sueltas).
 */
export function SaldoProyectadoPanel({
  projectedCents,
  isPending,
  currentBalanceCents,
  pendingFixedCount,
  pendingFixedCents,
  unpaidDebtsCount,
  unpaidDebtsCents,
  hidden,
  hideWhenNothingPending = false,
}: SaldoProyectadoPanelProps) {
  const nothingPending = pendingFixedCount === 0 && unpaidDebtsCount === 0
  if (hideWhenNothingPending && !isPending && nothingPending) return null

  return (
    <Panel className="p-6 ring-1 ring-acid/15">
      <p className="eyebrow">Saldo proyectado a fin de mes</p>
      {isPending ? (
        <Skeleton className="mt-2 h-9 w-32" />
      ) : (
        <Money cents={projectedCents ?? 0} tone="chalk" size="figure" className="mt-2" hidden={hidden} />
      )}

      <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-chalk-faint">Saldo actual</dt>
          <dd>
            <Money cents={currentBalanceCents} tone="dim" hidden={hidden} />
          </dd>
        </div>
        {pendingFixedCount > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-chalk-faint">Fijos por pagar ({pendingFixedCount})</dt>
            <dd>
              <Money cents={-pendingFixedCents} tone="coral" hidden={hidden} />
            </dd>
          </div>
        )}
        {unpaidDebtsCount > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-chalk-faint">Deudas por pagar ({unpaidDebtsCount})</dt>
            <dd>
              <Money cents={-unpaidDebtsCents} tone="coral" hidden={hidden} />
            </dd>
          </div>
        )}
      </dl>

      {nothingPending && (
        <p className="mt-3 text-[12px] text-chalk-faint">No tenés fijos ni deudas pendientes este mes.</p>
      )}
    </Panel>
  )
}
