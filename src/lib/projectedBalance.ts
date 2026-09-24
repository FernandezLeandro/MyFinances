/**
 * Bloque 4 del plan de arreglo de Fijos (FI-08): mirando un período FUTURO, el saldo proyectado (el
 * número grande de `SaldoProyectadoPanel`) también descuenta lo que sigue impago del período EN
 * CURSO — correcto: si no se paga antes, tampoco está pagado a fin del futuro. Pero el desglose
 * visible (`pendingFixedCents` + `unpaidDebtsCents`) sólo lista lo de ESE período futuro, así que el
 * panel no cerraba: "Saldo actual − Fijos por pagar" daba un número mayor que el titular, sin que
 * ninguna línea explicara la diferencia.
 *
 * Esta función pura calcula esa diferencia para una fila aparte ("Pendiente de antes") — función
 * pura, sin red, mismo criterio que `aggregate.ts`: se verifica con números a mano. En el período
 * ACTUAL da 0 por construcción (`horizonte` es el propio ciclo, sin nada anterior que arrastrar), así
 * que en Hoy (que nunca navega) esta fila nunca aparece.
 */
export function pendingBeforeCents(
  currentBalanceCents: number,
  pendingFixedCents: number,
  unpaidDebtsCents: number,
  projectedCents: number | undefined,
): number {
  if (projectedCents == null) return 0
  const explainedCents = currentBalanceCents - pendingFixedCents - unpaidDebtsCents
  return Math.max(explainedCents - projectedCents, 0)
}
