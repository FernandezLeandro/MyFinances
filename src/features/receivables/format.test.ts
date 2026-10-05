import { describe, expect, it } from 'vitest'
import { summarizeReceivables } from './aggregate'
import { estadoDeCobro } from './format'
import { makeReceivable, makeReceivablePayment } from '@/test/factories'

const TODAY = new Date('2026-09-15T12:00:00')

function estado(...args: Parameters<typeof makeReceivable>) {
  const r = makeReceivable({ id: 'r1', ...args[0] })
  const s = summarizeReceivables([r], [], TODAY)
  return estadoDeCobro(s.todas[0], TODAY)
}

describe('estadoDeCobro', () => {
  it('1 cuota vencida → «Venció en agosto», en negativo', () => {
    expect(estado({ amountCents: 10_00, expected_period: '2026-08-01' })).toEqual({ text: 'Venció en agosto', vencido: true })
  })

  it('cuotas con atraso → cuota del mes y lo vencido', () => {
    const { text, vencido } = estado({ amountCents: 300_00, installments: 3, expected_period: '2026-08-01' })
    expect(text).toMatch(/^Cuota 2\/3 · .*100,00 vencido$/)
    expect(vencido).toBe(true)
  })

  it('próxima cuota en otro año → mes con año', () => {
    expect(estado({ amountCents: 300_00, installments: 3, expected_period: '2027-01-01' }).text).toBe('Próxima cuota: ene 2027')
  })

  it('1 cuota futura y sin fecha', () => {
    expect(estado({ amountCents: 10_00, expected_period: '2026-11-01' }).text).toBe('Para noviembre')
    expect(estado({ amountCents: 10_00, expected_period: null }).text).toBe('Sin fecha')
  })

  it('1 cuota de este mes con un abono → lo que ya devolvió', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_00, expected_period: '2026-09-01' })
    const s = summarizeReceivables([r], [makeReceivablePayment({ receivable_id: 'r1', amountCents: 20_00 })], TODAY)
    expect(estadoDeCobro(s.esteMes[0], TODAY).text).toMatch(/^Te devolvió .*20,00$/)
  })
})
