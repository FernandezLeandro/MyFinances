import { describe, expect, it } from 'vitest'
import { FIXED_HELP_BASIC } from '@/features/fixed-expenses/help-content'

// Regresión: la ayuda de Fijos decía que «Sólo guardar plata» «se descuenta al pagar» para todos los
// planes. En Básico es falso: el guardado va aparte (`coversPayment: false`) y el pago sale por el
// importe entero — si descontara, un fijo guardado entero se pagaría sin generar ningún gasto.
describe('ayuda de Fijos para Básico', () => {
  it('no dice que lo guardado se descuenta al pagar', () => {
    const save = FIXED_HELP_BASIC.actions.find((a) => a.id === 'save')!
    expect(JSON.stringify(save).toLowerCase()).not.toContain('se descuenta')
    expect(save.description).toContain('importe entero')
  })
})
