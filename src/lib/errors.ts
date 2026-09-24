/**
 * Traduce lo que tira Supabase/Postgres a un mensaje mostrable. Nunca devuelve el `message` crudo
 * de Postgres — ni por accidente, ni en el default — porque cosas como "new row violates row-level
 * security policy for table \"assets\"" no le dicen nada útil a quien está usando la app.
 *
 * `code` es el SQLSTATE que PostgREST/supabase-js reenvía tal cual desde Postgres: '23503' (FK),
 * '23505' (unique), '42501' (permission denied — RLS o el candado de columna), 'P0001' (una
 * `RAISE EXCEPTION` de plpgsql, con el mensaje que se haya elegido ahí, p.ej. 'not_admin').
 */

const DEFAULT_MESSAGE = 'No se pudo guardar. Probá de nuevo.'

interface ErrorLike {
  code?: unknown
  message?: unknown
}

function isErrorLike(error: unknown): error is ErrorLike {
  return typeof error === 'object' && error !== null
}

/** True si `error` es un `raise exception` (`P0001`) de plpgsql cuyo mensaje es `pgCode` — el texto
 *  que se le pasó a `raise exception`. Para cuando quien llama necesita reaccionar a un error
 *  puntual con algo más que un toast (abrir un diálogo, ofrecer confirmar igual) sin repetir el
 *  parseo que ya hace `mensajeDeError`. */
export function isPgError(error: unknown, pgCode: string): boolean {
  if (!isErrorLike(error)) return false
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : ''
  return code === 'P0001' && new RegExp(pgCode).test(message)
}

/** True si `error` es un `23505` (unique_violation) sobre un índice o constraint puntual — mismo
 *  criterio que `isPgError`, para cuando quien llama necesita reaccionar a una carrera específica en
 *  vez de mostrar el mensaje genérico (ej. FI-11: un doble click que choca contra
 *  `fixed_expense_payments_single_per_period_idx` no es un error real, el primer intento ya pagó). */
export function isDuplicateKeyError(error: unknown, indexOrConstraint: string): boolean {
  if (!isErrorLike(error)) return false
  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : ''
  return code === '23505' && new RegExp(indexOrConstraint).test(message)
}

/** El fallo de red que cada navegador escribe a su manera: Chrome "Failed to fetch", Safari "Load
 *  failed", Firefox "NetworkError when attempting to fetch resource". */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i

function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error instanceof TypeError) return NETWORK_FAILURE.test(error.message)
  // supabase-js NO tira el `TypeError` de `fetch`: lo devuelve envuelto en un objeto de error con el
  // texto en `message` ("TypeError: Failed to fetch"), así que hay que mirarlo por el texto.
  return isErrorLike(error) && typeof error.message === 'string' && NETWORK_FAILURE.test(error.message)
}

export function mensajeDeError(error: unknown): string {
  if (isOffline(error)) return 'Sin conexión. Revisá internet y probá de nuevo.'
  if (!isErrorLike(error)) return DEFAULT_MESSAGE

  const code = typeof error.code === 'string' ? error.code : ''
  const message = typeof error.message === 'string' ? error.message : ''

  if (code === '23503') return 'No se puede eliminar: hay movimientos que lo usan. Probá archivarlo.'
  // Más específico que el 23505 genérico de abajo: el índice único de nombres de cuenta
  // (`balance_locations_user_name_idx`, N6 del QA) — sólo se llega crudo acá por una carrera, ya que
  // `rpc_create_account` lo comprueba antes y devuelve `account_duplicate_name` (ver más abajo).
  if (code === '23505' && /balance_locations_user_name_idx/.test(message)) return 'Ya tenés una cuenta con ese nombre.'
  if (code === '23505') return 'Ya existe algo con esos datos.'
  if (code === '42501' || /row-level security/i.test(message)) return 'No tenés permiso para hacer eso.'
  if (code === 'PGRST301' || /jwt/i.test(message)) return 'Se venció tu sesión. Volvé a entrar.'
  if (code === 'P0001' && /not_admin/.test(message)) return 'Necesitás permisos de administrador.'
  if (code === 'P0001' && /not_authenticated/.test(message)) return 'Se venció tu sesión. Volvé a entrar.'
  if (code === 'P0001' && /invalid_plan/.test(message)) return 'Ese plan no existe.'
  if (code === 'P0001' && /cannot_demote_self/.test(message)) return 'No podés sacarte el admin a vos mismo.'
  if (code === 'P0001' && /cannot_delete_self/.test(message)) return 'No podés eliminar tu propia cuenta desde acá.'
  if (code === 'P0001' && /account_not_found/.test(message)) return 'Esa cuenta ya no existe.'
  if (code === 'P0001' && /account_adjust_nothing_to_adjust/.test(message)) return 'Ya coincide: no hay nada que reajustar.'
  if (code === 'P0001' && /account_adjust_invalid_amount/.test(message)) return 'Ingresá un importe válido.'
  if (code === 'P0001' && /account_insufficient_funds/.test(message)) return 'Esa cuenta no tiene tanta plata: bajá el importe.'
  if (code === 'P0001' && /account_invalid_amount/.test(message)) return 'Ingresá un importe válido.'
  if (code === 'P0001' && /account_invalid_name/.test(message)) return 'Ponele un nombre a la cuenta.'
  if (code === 'P0001' && /account_last_active/.test(message))
    return 'Es tu última cuenta activa: para dejar de usar Cuentas, desactivalas desde Ajustes.'
  if (code === 'P0001' && /account_duplicate_name/.test(message)) return 'Ya tenés una cuenta con ese nombre.'
  if (code === 'P0001' && /no_accounts_to_stop/.test(message)) return 'Ya no tenés cuentas.'
  if (code === 'P0001' && /payment_before_accounts/.test(message))
    return 'Este pago es de antes de tener cuentas: quitarlo y volver a pagarlo descuenta la plata dos veces.'
  // Bloque 1 del QA de Fijos (FI-02/FI-03): triggers `transactions_sync_linked_fixed_expense` y
  // `transactions_block_delete_paid_saving` (`20260923070001_fijos_movimiento_vinculado.sql`).
  if (code === 'P0001' && /linked_movement_type_locked/.test(message))
    return 'Este movimiento viene de un fijo: no se puede cambiar entre Gasto e Ingreso.'
  if (code === 'P0001' && /linked_movement_amount_invalid/.test(message)) return 'Ingresá un importe válido.'
  if (code === 'P0001' && /fixed_expense_saving_period_paid/.test(message))
    return 'Este guardado es de un mes ya pagado: primero quitá el pago del fijo.'

  return DEFAULT_MESSAGE
}
