/**
 * Todo lo que cambia cuando se crea, edita o borra un movimiento — en un módulo aparte, sin red, para
 * poder testear que la lista esté completa (`queryKeys.test.ts`) y compartirla con Cuentas
 * (reajustar un saldo con movimiento mueve exactamente lo mismo).
 *
 * Cada key es el primer elemento del `queryKey` de su hook; `invalidateTransactionQueries` le suma
 * el `userId`, así que invalida todas las variantes por período/rango de esa query.
 */
export const TRANSACTION_QUERY_KEYS = [
  'transactions',
  'balance',
  'monthly-summary',
  // Ingresos/Gastos del ciclo en Hoy (`useRangeSummary`). Faltaba acá: quedaban viejos después de
  // cargar un movimiento hasta que la ventana recuperaba el foco.
  'range-summary',
  'spend-by-category',
  // El primer término de `rpc_projected_balance_range` es el saldo actual — cualquier movimiento, en
  // cualquier mes, lo mueve. Sin esto el proyectado de Fijos/Mis Deudas queda desactualizado.
  'projected-balance-range',
  // El saldo derivado por cuenta suma exactamente estas mismas filas.
  'account-balances',
] as const

export type TransactionQueryKey = (typeof TRANSACTION_QUERY_KEYS)[number]
