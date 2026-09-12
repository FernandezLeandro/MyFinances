/**
 * Fuente única de qué pantallas y acciones ve cada plan. Nunca la base: `profiles.plan` sólo guarda
 * el string, esto es lo único que decide qué habilita — habilitar Análisis a los `basic` es mover un
 * string acá, sin migración ni deploy de la base. Ver también `role` (user/admin, en
 * `src/features/profile/api.ts`): eso es el permiso, esto es el nivel de acceso — cosas separadas a
 * propósito, no se mezclan en el mismo campo.
 */

export type Plan = 'test' | 'basic' | 'premium'

export type Capability =
  | 'movimientos'
  | 'fijos'
  | 'analisis'
  | 'ahorros'
  | 'mis-deudas'
  | 'me-deben'
  | 'ajustes-completo'
  | 'cuentas'
  | 'compartido'
  | 'cuadrar-saldo'
  // Bloque 4 del plan "BASIC centrado en fijos": el registro manual de un movimiento cualquiera —
  // no la app entera. BASIC sigue viendo /movimientos (ya lo tenía por `movimientos`), pero sólo
  // puede llegar a un movimiento pagando un fijo (ver `RegisterFixedExpenseDialog`, el selector que
  // abre el `+` para ese plan en vez de `TransactionFormDialog`); sin esta capacidad no puede
  // cargar uno suelto, ni desde Hoy/Movimientos ni desde el `+` de la isla.
  | 'movimientos-manuales'

const ALL_CAPABILITIES: readonly Capability[] = [
  'movimientos',
  'fijos',
  'analisis',
  'ahorros',
  'mis-deudas',
  'me-deben',
  'ajustes-completo',
  'cuentas',
  'compartido',
  'cuadrar-saldo',
  'movimientos-manuales',
]

/** `/hoy` no tiene capacidad asociada a propósito: es el home y el destino de todos los redirects,
 *  todo plan lo ve. */
const PLAN_CAPS: Record<Plan, readonly Capability[]> = {
  test: ['movimientos', 'fijos', 'analisis', 'movimientos-manuales'],
  basic: ['movimientos', 'fijos'],
  premium: ALL_CAPABILITIES,
}

export function can(plan: Plan, cap: Capability): boolean {
  return PLAN_CAPS[plan].includes(cap)
}

export const PLANS: readonly Plan[] = ['test', 'basic', 'premium']

export const PLAN_LABEL: Record<Plan, string> = {
  test: 'Test',
  basic: 'Básico',
  premium: 'Premium',
}
