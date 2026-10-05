import { describe, expect, it } from 'vitest'
import { cobradoEnMes, cuotaCents, cuotasDelMes, esperadoHasta, summarizeReceivables } from './aggregate'
import { makeReceivable, makeReceivablePayment } from '@/test/factories'

const TODAY = new Date('2026-09-15T12:00:00')

describe('cuotaCents / esperadoHasta', () => {
  it('$100 en 3 cuotas → 33,33 / 33,33 / 33,34: la última absorbe el resto y la suma da exacto', () => {
    expect([1, 2, 3].map((n) => cuotaCents(100_00, 3, n))).toEqual([33_33, 33_33, 33_34])
    expect(esperadoHasta(100_00, 3, 2)).toBe(66_66)
    expect(esperadoHasta(100_00, 3, 3)).toBe(100_00)
  })

  it('k fuera de rango se acota', () => {
    expect(esperadoHasta(100_00, 3, -1)).toBe(0)
    expect(esperadoHasta(100_00, 3, 7)).toBe(100_00)
  })
})

describe('summarizeReceivables', () => {
  it('sin deudas → todo en 0, sin romper', () => {
    const s = summarizeReceivables([], [], TODAY)
    expect(s.esteMes).toEqual([])
    expect(s.sinFecha).toEqual([])
    expect(s.aCobrarCents).toBe(0)
    expect(s.totalPendingCents).toBe(0)
  })

  it('abono parcial → pendiente = total - abonado', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 20_000_00 })]
    const [s] = summarizeReceivables([r], payments, TODAY).sinFecha
    expect(s.paidCents).toBe(20_000_00)
    expect(s.pendingCents).toBe(30_000_00)
    expect(s.cobrada).toBe(false)
  })

  it('varios abonos que suman el total → cobrada, fuera de las listas de pendientes', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 30_000_00, expected_period: '2026-09-01' })
    const payments = [10_000_00, 10_000_00, 10_000_00].map((amountCents) => makeReceivablePayment({ receivable_id: 'r1', amountCents }))
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.esteMes).toHaveLength(0)
    expect(s.todas[0].cobrada).toBe(true)
    expect(s.totalPendingCents).toBe(0)
  })

  it('cobrada de más → pendiente 0, no negativo', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 30_000_00 })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 35_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.totalPendingCents).toBe(0)
  })

  it('deuda de $0 sin abonos (fila fantasma legacy) → no cuenta como cobrada', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 0 })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.todas[0].cobrada).toBe(false)
  })

  describe('1 cuota: mismo comportamiento que antes de las cuotas', () => {
    it('mes esperado pasado → todo vencido', () => {
      const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-08-01' })
      const s = summarizeReceivables([r], [], TODAY)
      expect(s.esteMes[0].vencida).toBe(true)
      expect(s.vencidoCents).toBe(10_000_00)
      expect(s.aCobrarCents).toBe(10_000_00)
    })

    it('mes en curso → este mes, no vencida (vence al terminar el mes, no antes)', () => {
      const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-09-01' })
      const [s] = summarizeReceivables([r], [], TODAY).esteMes
      expect(s.vencida).toBe(false)
      expect(s.esteMesCents).toBe(10_000_00)
      expect(s.cuotaDelMes).toBe(1)
    })

    it('mes futuro → más adelante, con su mes como próximo', () => {
      const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-11-01' })
      const s = summarizeReceivables([r], [], TODAY)
      expect(s.esteMes).toHaveLength(0)
      expect(s.todas[0].proximoPeriodo).toBe('2026-11-01')
    })

    it('sin mes esperado → nunca vencida, aunque sea vieja; cobrar arranca con todo lo pendiente', () => {
      const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: null, created_at: '2020-01-01T00:00:00.000Z' })
      const [s] = summarizeReceivables([r], [], TODAY).sinFecha
      expect(s.vencida).toBe(false)
      expect(s.proximoPeriodo).toBeNull()
      expect(s.proximoCobroCents).toBe(10_000_00)
    })
  })

  describe('en cuotas', () => {
    // $300.000 en 3 cuotas de $100.000 desde agosto: agosto ya pasó, septiembre es este mes.
    const r = makeReceivable({ id: 'r1', amountCents: 300_000_00, installments: 3, expected_period: '2026-08-01' })

    it('sin abonos → la de agosto vencida, la de septiembre este mes, la de octubre más adelante', () => {
      const s = summarizeReceivables([r], [], TODAY)
      const [item] = s.esteMes
      expect(item.vencidoCents).toBe(100_000_00)
      expect(item.esteMesCents).toBe(100_000_00)
      expect(item.cuotaDelMes).toBe(2)
      expect(item.proximoPeriodo).toBe('2026-10-01')
      expect(s.aCobrarCents).toBe(200_000_00)
    })

    it('un abono parcial se imputa primero a la cuota vencida', () => {
      const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 150_000_00, occurred_on: '2026-09-02' })]
      const [item] = summarizeReceivables([r], payments, TODAY).esteMes
      expect(item.vencidoCents).toBe(0)
      expect(item.esteMesCents).toBe(50_000_00)
      expect(item.cuotasCobradas).toBe(1)
      expect(item.proximoCobroCents).toBe(50_000_00)
    })

    it('adelantar la cuota del mes → este mes en 0, pasa a más adelante y cobrar arranca con la próxima', () => {
      const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 200_000_00, occurred_on: '2026-09-02' })]
      const s = summarizeReceivables([r], payments, TODAY)
      expect(s.esteMes).toHaveLength(0)
      const [item] = s.todas
      expect(item.aCobrarCents).toBe(0)
      expect(item.proximoPeriodo).toBe('2026-10-01')
      expect(item.proximoCobroCents).toBe(100_000_00)
    })

    it('primera cuota en un mes futuro → nada vence ni cae este mes', () => {
      const future = makeReceivable({ id: 'r2', amountCents: 90_000_00, installments: 3, expected_period: '2026-12-01' })
      const [item] = summarizeReceivables([future], [], TODAY).todas
      expect(item.cuotaDelMes).toBeNull()
      expect(item.proximoPeriodo).toBe('2026-12-01')
      expect(item.proximoCobroCents).toBe(30_000_00)
    })

    it('todas las cuotas ya pasaron → todo lo pendiente vencido', () => {
      const old = makeReceivable({ id: 'r3', amountCents: 90_000_00, installments: 3, expected_period: '2026-01-01' })
      const [item] = summarizeReceivables([old], [], TODAY).esteMes
      expect(item.vencidoCents).toBe(90_000_00)
      expect(item.cuotaDelMes).toBeNull()
      expect(item.proximoPeriodo).toBeNull()
    })
  })

  describe('cuotasDelMes', () => {
    // $300 en 3 cuotas desde septiembre (este mes), con $150 ya cobrados: la de septiembre cubierta, la
    // de octubre a medias, la de noviembre entera.
    const r = makeReceivable({ id: 'r1', amountCents: 300_00, installments: 3, expected_period: '2026-09-01' })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 150_00 })]
    const { todas } = summarizeReceivables([r], payments, TODAY)
    const at = (period: string) => cuotasDelMes(todas, period).map((c) => [c.cuota, c.cuotaCents, c.faltaCents])

    it('cada mes tiene su cuota y lo que falta de ella, con los abonos imputados en orden', () => {
      expect(at('2026-09-01')).toEqual([[1, 100_00, 0]])
      expect(at('2026-10-01')).toEqual([[2, 100_00, 50_00]])
      expect(at('2026-11-01')).toEqual([[3, 100_00, 100_00]])
    })

    it('fuera del rango de cuotas, y sin fecha, no aparece', () => {
      expect(at('2026-08-01')).toEqual([])
      expect(at('2026-12-01')).toEqual([])
      const sinFecha = summarizeReceivables([makeReceivable({ id: 'r2', amountCents: 10_00 })], [], TODAY).todas
      expect(cuotasDelMes(sinFecha, '2026-09-01')).toEqual([])
    })

    it('una deuda ya cobrada entera sigue figurando, cubierta, en sus meses', () => {
      const paid = summarizeReceivables([r], [makeReceivablePayment({ receivable_id: 'r1', amountCents: 300_00 })], TODAY).todas
      expect(cuotasDelMes(paid, '2026-11-01').map((c) => c.faltaCents)).toEqual([0])
    })
  })

  it('cobrado este mes suma sólo los abonos del mes, y lista también las ya cobradas enteras', () => {
    const r1 = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const r2 = makeReceivable({ id: 'r2', amountCents: 30_000_00 })
    const r3 = makeReceivable({ id: 'r3', amountCents: 10_000_00 })
    const payments = [
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 20_000_00, occurred_on: '2026-09-03' }),
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 5_000_00, occurred_on: '2026-08-30' }), // mes anterior
      makeReceivablePayment({ receivable_id: 'r2', amountCents: 30_000_00, occurred_on: '2026-09-10' }), // la salda
      makeReceivablePayment({ receivable_id: 'r3', amountCents: 10_000_00, occurred_on: '2026-07-01' }), // cobrada antes
    ]
    const s = summarizeReceivables([r1, r2, r3], payments, TODAY)
    expect(s.cobradoEsteMesCents).toBe(50_000_00)
    expect(cobradoEnMes(s.todas, '2026-09-01').map((x) => [x.summary.receivable.id, x.cents])).toEqual([
      ['r2', 30_000_00],
      ['r1', 20_000_00],
    ])
    expect(cobradoEnMes(s.todas, '2026-07-01').map((x) => x.summary.receivable.id)).toEqual(['r3'])
  })
})
