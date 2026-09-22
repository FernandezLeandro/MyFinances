import { afterEach, describe, expect, it, vi } from 'vitest'
import { mensajeDeError } from './errors'

describe('mensajeDeError', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('un fallo de red que supabase-js devuelve envuelto en un objeto → sin conexión', () => {
    // Regresión: supabase-js no tira el TypeError de fetch, lo devuelve como { message: 'TypeError:
    // Failed to fetch' }. Antes caía en el mensaje genérico y no se distinguía de un error de la base.
    for (const message of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(mensajeDeError({ message })).toBe('Sin conexión. Revisá internet y probá de nuevo.')
    }
  })

  it('un TypeError de fetch de cualquier navegador → sin conexión', () => {
    expect(mensajeDeError(new TypeError('Load failed'))).toBe('Sin conexión. Revisá internet y probá de nuevo.')
  })

  it('un TypeError que NO es de red no se confunde con uno', () => {
    expect(mensajeDeError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      'No se pudo guardar. Probá de nuevo.',
    )
  })

  it('FK violation (23503) → sugiere archivar en vez de eliminar', () => {
    expect(mensajeDeError({ code: '23503', message: 'update or delete on table "assets" violates foreign key constraint' })).toBe(
      'No se puede eliminar: hay movimientos que lo usan. Probá archivarlo.',
    )
  })

  it('unique violation (23505) → ya existe', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'Ya existe algo con esos datos.',
    )
  })

  // N6 del QA: `rpc_create_account` frena con `account_duplicate_name` antes de llegar al índice, pero
  // una edición directa (`useUpdateBalanceLocation`) puede chocar con el índice crudo en una carrera.
  it('unique violation sobre el índice de nombres de cuenta → mensaje específico, no el genérico', () => {
    expect(
      mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "balance_locations_user_name_idx"' }),
    ).toBe('Ya tenés una cuenta con ese nombre.')
  })

  it('account_duplicate_name (P0001) → mismo mensaje que el índice', () => {
    expect(mensajeDeError({ code: 'P0001', message: 'account_duplicate_name' })).toBe('Ya tenés una cuenta con ese nombre.')
  })

  it('account_last_active (P0001) → apunta al interruptor de Ajustes, no a "Dejar de usar Cuentas"', () => {
    // Regresión: el texto viejo mencionaba un botón que ya no existe (era parte del diálogo de
    // eliminar la última cuenta, que se sacó cuando esa salida pasó a ser sólo el interruptor).
    expect(mensajeDeError({ code: 'P0001', message: 'account_last_active' })).toBe(
      'Es tu última cuenta activa: para dejar de usar Cuentas, desactivalas desde Ajustes.',
    )
  })

  it('permission denied (42501) → sin permiso', () => {
    expect(mensajeDeError({ code: '42501', message: 'permission denied for table profiles' })).toBe(
      'No tenés permiso para hacer eso.',
    )
  })

  it('mensaje de RLS sin código reconocible → igual detecta "row-level security"', () => {
    expect(mensajeDeError({ message: 'new row violates row-level security policy for table "assets"' })).toBe(
      'No tenés permiso para hacer eso.',
    )
  })

  it('PGRST301 (JWT inválido/vencido) → sesión vencida', () => {
    expect(mensajeDeError({ code: 'PGRST301', message: 'JWT expired' })).toBe('Se venció tu sesión. Volvé a entrar.')
  })

  it('P0001 con not_admin → permisos de administrador', () => {
    expect(mensajeDeError({ code: 'P0001', message: 'not_admin' })).toBe('Necesitás permisos de administrador.')
  })

  it('P0001 con not_authenticated → sesión vencida', () => {
    expect(mensajeDeError({ code: 'P0001', message: 'not_authenticated' })).toBe('Se venció tu sesión. Volvé a entrar.')
  })

  it('P0001 de cuentas → mensajes propios de Cuentas (reajuste y borrado)', () => {
    expect(mensajeDeError({ code: 'P0001', message: 'account_not_found' })).toBe('Esa cuenta ya no existe.')
    expect(mensajeDeError({ code: 'P0001', message: 'account_adjust_nothing_to_adjust' })).toBe(
      'Ya coincide: no hay nada que reajustar.',
    )
    expect(mensajeDeError({ code: 'P0001', message: 'account_adjust_invalid_amount' })).toBe('Ingresá un importe válido.')
    // Crear una cuenta sacando la plata de otra: la base rechaza sacar más de lo que tiene.
    expect(mensajeDeError({ code: 'P0001', message: 'account_insufficient_funds' })).toBe('Esa cuenta no tiene tanta plata: bajá el importe.')
    expect(mensajeDeError({ code: 'P0001', message: 'account_invalid_amount' })).toBe('Ingresá un importe válido.')
    expect(mensajeDeError({ code: 'P0001', message: 'account_invalid_name' })).toBe('Ponele un nombre a la cuenta.')
  })

  it('TypeError de "Failed to fetch" → sin conexión', () => {
    expect(mensajeDeError(new TypeError('Failed to fetch'))).toBe('Sin conexión. Revisá internet y probá de nuevo.')
  })

  it('navigator.onLine en false → sin conexión, sin importar el error', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(mensajeDeError({ code: '23503', message: 'no debería importar' })).toBe('Sin conexión. Revisá internet y probá de nuevo.')
  })

  it('error desconocido → mensaje genérico, nunca el message crudo de Postgres', () => {
    expect(mensajeDeError({ code: '99999', message: 'algo raro pasó en la base' })).toBe('No se pudo guardar. Probá de nuevo.')
  })

  it('no-objeto (string, undefined, null) → mensaje genérico sin romper', () => {
    expect(mensajeDeError('un string cualquiera')).toBe('No se pudo guardar. Probá de nuevo.')
    expect(mensajeDeError(undefined)).toBe('No se pudo guardar. Probá de nuevo.')
    expect(mensajeDeError(null)).toBe('No se pudo guardar. Probá de nuevo.')
  })
})
