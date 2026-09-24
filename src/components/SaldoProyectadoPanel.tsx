import { cycleEndNoun, cycleThisLabel, type CycleKind } from '@/lib/cycle'
import { SummaryPanel, type SummaryRow } from '@/components/ui/SummaryPanel'

interface SaldoProyectadoPanelProps {
  /** El ciclo de caja activo (mensual/quincenal/semanal) — decide el "fin de ___" del título
   *  default y del que arma Hoy. */
  cycleKind: CycleKind
  /** "Saldo proyectado a fin de {mes|quincena|semana}" (default, Fijos/Mis Deudas) — Hoy pasa el
   *  título más corto del hero ("Proyectado a fin de {mes|quincena|semana}"), que ya tiene su
   *  propio "Saldo actual" arriba y no necesita repetir la palabra. */
  title?: string
  projectedCents: number | undefined
  isPending: boolean
  currentBalanceCents: number
  pendingFixedCount: number
  pendingFixedCents: number
  /** Bloque 3: cuánto de `pendingFixedCents` ya está guardado (`summarizeFixedExpenses.savedTotalCents`)
   *  — fila informativa, no resta del proyectado (el guardado no es un pago). `undefined`/`0` la
   *  omite: la mayoría de los usuarios no guarda nada, y una fila en $0 no aporta nada. */
  savedFixedCents?: number
  /** Tarjetas + compras sueltas impagas de este período (ver `summarizeMisDeudas`). */
  unpaidDebtsCount: number
  unpaidDebtsCents: number
  /** Bloque 4 (FI-08): `pendingBeforeCents` (`src/lib/projectedBalance.ts`) — lo que el proyectado
   *  descuenta de un período ANTERIOR al que se mira (sólo pasa en un período futuro), sin línea
   *  propia hasta esto. `undefined`/`0` la omite — en el período actual siempre da 0. */
  pendingBeforeCents?: number
  hidden: boolean
  /** Hoy oculta el panel entero cuando no hay nada que descontar (redundante con el hero de
   *  arriba); Fijos lo deja siempre visible con una línea aclaratoria. */
  hideWhenNothingPending?: boolean
  /** La fila "Saldo actual" del desglose — `true` por default (Fijos, y el panel de escritorio de
   *  Hoy). La versión de mobile de Hoy la apaga: el saldo actual ya es el titular del hero de
   *  arriba, repetirlo acá abajo es ruido. */
  showCurrentBalanceRow?: boolean
  /** La barrita de comprometido/libre — sólo la versión mobile de Hoy la pide, como acompañamiento
   *  visual más compacto que las dos filas de desglose. */
  bar?: boolean
  /** Pisa el footnote de "nada pendiente" con uno fijo, sin importar `nothingPending` — Mis Deudas lo
   *  usa para aclarar que es el mismo número que en Fijos (mismo panel, dos pantallas). */
  footnote?: string
}

/**
 * Panel compartido entre Hoy y Fijos (antes ~35 líneas duplicadas en cada página): el desglose de
 * los términos que `rpc_projected_balance` descuenta del saldo actual — fijos pendientes (bolsas
 * mensuales incluidas) y deudas impagas (tarjetas y compras sueltas). El markup en sí vive en
 * `SummaryPanel`, compartido a su vez con los paneles de resumen de Mis Deudas y Me Deben — acá
 * sólo queda la lógica de dominio: qué filas mostrar y cuándo esconder el panel entero.
 *
 * Siempre `inverse`: en el sistema Bento esta es la única tarjeta oscura fija de la app (Hoy y
 * Fijos), a diferencia de los totales de Mis Deudas/Me Deben, que se distinguen con el ring de
 * acento (`accent`) sobre una tarjeta normal.
 */
export function SaldoProyectadoPanel({
  cycleKind,
  title,
  projectedCents,
  isPending,
  currentBalanceCents,
  pendingFixedCount,
  pendingFixedCents,
  savedFixedCents,
  unpaidDebtsCount,
  unpaidDebtsCents,
  pendingBeforeCents,
  hidden,
  hideWhenNothingPending = false,
  showCurrentBalanceRow = true,
  bar = false,
  footnote,
}: SaldoProyectadoPanelProps) {
  const nothingPending = pendingFixedCount === 0 && unpaidDebtsCount === 0
  if (hideWhenNothingPending && !isPending && nothingPending) return null

  const resolvedTitle = title ?? `Saldo proyectado a fin de ${cycleEndNoun(cycleKind)}`

  const rows: SummaryRow[] = []
  if (showCurrentBalanceRow) rows.push({ label: 'Saldo actual', cents: currentBalanceCents })
  if (pendingFixedCount > 0) {
    rows.push({ label: `Fijos por pagar (${pendingFixedCount})`, cents: -pendingFixedCents, tone: 'negativeOnInverse' })
  }
  if (savedFixedCents) {
    rows.push({ label: 'Guardado para fijos', cents: savedFixedCents, tone: 'onInverseSecondary' })
  }
  if (unpaidDebtsCount > 0) {
    rows.push({ label: `Deudas por pagar (${unpaidDebtsCount})`, cents: -unpaidDebtsCents, tone: 'negativeOnInverse' })
  }
  if (pendingBeforeCents) {
    rows.push({ label: 'Pendiente de antes', cents: -pendingBeforeCents, tone: 'negativeOnInverse' })
  }

  // Mismos términos que las filas de arriba: comprometido = fijos + deudas pendientes, sobre el
  // saldo actual — así la barra nunca puede desincronizarse del desglose que tiene al lado.
  const committedCents = pendingFixedCents + unpaidDebtsCents
  const committedPct = currentBalanceCents > 0 ? Math.min((committedCents / currentBalanceCents) * 100, 100) : 0

  return (
    <SummaryPanel
      title={resolvedTitle}
      cents={projectedCents}
      isPending={isPending}
      hidden={hidden}
      inverse
      extra={
        bar && !isPending ? (
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-pill bg-inverse-divider">
            <div className="h-full bg-negative-on-inverse" style={{ width: `${committedPct}%` }} />
            <div className="h-full bg-accent-text" style={{ width: `${100 - committedPct}%` }} />
          </div>
        ) : undefined
      }
      rows={rows}
      footnote={footnote ?? (nothingPending ? `No tenés fijos ni deudas pendientes ${cycleThisLabel(cycleKind)}.` : undefined)}
    />
  )
}
