import { afterEach, describe, expect, it, vi } from 'vitest'
import { mensajeDeError } from './errors'

describe('mensajeDeError', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
