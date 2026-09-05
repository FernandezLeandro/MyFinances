import { SummaryPanel, type SummaryRow } from '@/components/ui/SummaryPanel'

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
 * mensuales incluidas) y deudas impagas (tarjetas y compras sueltas). El markup en sí vive en
 * `SummaryPanel`, compartido a su vez con los paneles de resumen de Mis Deudas y Me Deben — acá
 * sólo queda la lógica de dominio: qué filas mostrar y cuándo esconder el panel entero.
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

  const rows: SummaryRow[] = [{ label: 'Saldo actual', cents: currentBalanceCents, tone: 'dim' }]
  if (pendingFixedCount > 0) {
    rows.push({ label: `Fijos por pagar (${pendingFixedCount})`, cents: -pendingFixedCents, tone: 'coral' })
  }
  if (unpaidDebtsCount > 0) {
    rows.push({ label: `Deudas por pagar (${unpaidDebtsCount})`, cents: -unpaidDebtsCents, tone: 'coral' })
  }

  return (
    <SummaryPanel
      title="Saldo proyectado a fin de mes"
      cents={projectedCents}
      isPending={isPending}
      hidden={hidden}
      accent
      rows={rows}
      footnote={nothingPending ? 'No tenés fijos ni deudas pendientes este mes.' : undefined}
    />
  )
}
