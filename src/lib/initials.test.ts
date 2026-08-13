import { describe, expect, it } from 'vitest'
import { initialsFrom } from './initials'

describe('initialsFrom', () => {
  it('nombre y apellido → primera letra de cada uno', () => {
    expect(initialsFrom('Lean Fernández', 'lean@example.com')).toBe('LF')
  })

  it('un solo nombre → primeras dos letras', () => {
    expect(initialsFrom('Lean', 'lean@example.com')).toBe('LE')
  })

  it('nombre con espacios extra → se ignoran', () => {
    expect(initialsFrom('  Lean   Fernández  ', 'lean@example.com')).toBe('LF')
  })

  it('sin nombre → cae al local-part del email', () => {
    expect(initialsFrom(null, 'leanfernandez@example.com')).toBe('LE')
  })

  it('sin nombre ni email → "?"', () => {
    expect(initialsFrom(null, null)).toBe('?')
  })
})
