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

/** Lo que cambia cuando se crea o borra una transferencia entre cuentas. Ni `monthly-summary` ni
 *  `range-summary` ni `spend-by-category` las ven (no son gasto ni ingreso), pero el saldo global
 *  sí puede moverse: sólo suman las cuentas ACTIVAS (`20260920010001_archivar_saca_del_saldo.sql`),
 *  así que borrar una transferencia con una punta archivada cambia el saldo y el proyectado. */
export const TRANSFER_QUERY_KEYS = ['account-transfers', 'account-balances', 'balance', 'projected-balance-range'] as const
