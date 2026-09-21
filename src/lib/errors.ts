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

  return DEFAULT_MESSAGE
}
