import { describe, expect, it } from 'vitest'
import { resolveSiteUrl } from './site-url'

describe('resolveSiteUrl', () => {
  it('usa el origin cuando no hay VITE_SITE_URL configurada', () => {
    expect(resolveSiteUrl(undefined, 'http://localhost:5173', '/restablecer')).toBe('http://localhost:5173/restablecer')
  })

  it('la variable configurada le gana al origin', () => {
    // El caso que motiva todo esto: pedir el reset desde un preview de Cloudflare Pages tiene que
    // mandar el link al dominio de producción igual.
    expect(resolveSiteUrl('https://myfinances.app', 'https://abc123.myfinances.pages.dev', '/restablecer')).toBe(
      'https://myfinances.app/restablecer',
    )
  })

  it('normaliza la barra final de la variable configurada', () => {
    expect(resolveSiteUrl('https://myfinances.app/', 'http://x', '/restablecer')).toBe('https://myfinances.app/restablecer')
    expect(resolveSiteUrl('https://myfinances.app///', 'http://x', '/restablecer')).toBe('https://myfinances.app/restablecer')
  })

  it('normaliza la barra final del origin cuando cae al fallback', () => {
    expect(resolveSiteUrl(undefined, 'http://localhost:5173/', '/restablecer')).toBe('http://localhost:5173/restablecer')
  })

  it('trata una variable vacía o en blanco como no configurada', () => {
    // Cloudflare Pages deja definir una variable sin valor: si no cayera al origin, el link saldría
    // como `/restablecer` sin host y el mail quedaría roto.
    expect(resolveSiteUrl('', 'http://localhost:5173', '/restablecer')).toBe('http://localhost:5173/restablecer')
    expect(resolveSiteUrl('   ', 'http://localhost:5173', '/restablecer')).toBe('http://localhost:5173/restablecer')
  })

  it('no le come el espacio de más a una variable con espacios alrededor', () => {
    expect(resolveSiteUrl('  https://myfinances.app  ', 'http://x', '/restablecer')).toBe('https://myfinances.app/restablecer')
  })
})
