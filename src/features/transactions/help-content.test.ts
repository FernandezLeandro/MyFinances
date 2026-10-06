import { describe, expect, it } from 'vitest'
import { MOVEMENTS_HELP_BASIC } from '@/features/transactions/help-content'

// Básico no tiene Cuentas ni carga manual. La ayuda completa habla de transferencias, cuentas y de
// editar movimientos: copiada tal cual a Básico le explicaría cosas que ese plan no ve ni puede hacer.
// Si alguna de estas palabras vuelve a esa versión, es porque se heredó sin revisar del texto completo.
describe('ayuda de Movimientos para Básico', () => {
  const text = JSON.stringify(MOVEMENTS_HELP_BASIC).toLowerCase()

  it.each(['transferencia', 'cuenta', 'nuevo movimiento', 'editarlo'])('no menciona «%s»', (word) => {
    expect(text).not.toContain(word)
  })
})
