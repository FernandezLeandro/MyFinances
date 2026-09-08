import { describe, expect, it } from 'vitest'
import { agruparPorMesEsperado, particionarPorHorizonte, summarizeReceivables } from './aggregate'
import { makeReceivable, makeReceivablePayment, makeReceivableSummary } from '@/test/factories'

const TODAY = new Date('2026-09-15T12:00:00')

describe('summarizeReceivables', () => {
  it('sin deudas → todo en 0, sin romper', () => {
    const s = summarizeReceivables([], [], TODAY)
    expect(s.pendientes).toEqual([])
    expect(s.cobradas).toEqual([])
    expect(s.totalPendingCents).toBe(0)
    expect(s.contadoEnSaldoCents).toBe(0)
    expect(s.yaGastadoPendingCents).toBe(0)
    expect(s.vencidasCount).toBe(0)
  })

  it('deuda sin abonos → pendiente igual al total, no cobrada', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes).toHaveLength(1)
    expect(s.pendientes[0].paidCents).toBe(0)
    expect(s.pendientes[0].pendingCents).toBe(50_000_00)
    expect(s.pendientes[0].cobrada).toBe(false)
  })

  it('abono parcial → pendiente = total - abonado', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 20_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.pendientes[0].paidCents).toBe(20_000_00)
    expect(s.pendientes[0].pendingCents).toBe(30_000_00)
    expect(s.pendientes[0].cobrada).toBe(false)
  })

  it('abonos que suman el total exacto → cobrada, pendiente 0', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 50_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.pendientes).toHaveLength(0)
    expect(s.cobradas).toHaveLength(1)
    expect(s.cobradas[0].pendingCents).toBe(0)
  })

  it('varios abonos que suman el total → cobrada (el caso "me lo pagó en tres veces")', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 30_000_00 })
    const payments = [
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 10_000_00 }),
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 10_000_00 }),
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 10_000_00 }),
    ]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.cobradas).toHaveLength(1)
    expect(s.cobradas[0].paidCents).toBe(30_000_00)
  })

  it('cobrada de más → pendiente 0 (no negativo) y el excedente en overpaidCents', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 30_000_00 })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 35_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.cobradas[0].pendingCents).toBe(0)
    expect(s.cobradas[0].overpaidCents).toBe(5_000_00)
  })

  it('deuda de $0 sin abonos (fila fantasma legacy) → no aparece como cobrada', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 0 })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes).toHaveLength(1)
    expect(s.cobradas).toHaveLength(0)
    expect(s.pendientes[0].cobrada).toBe(false)
  })

  it('already_expensed: false → cuenta en el cuadre y suma en contadoEnSaldoCents', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00, already_expensed: false })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes[0].cuentaEnCuadre).toBe(true)
    expect(s.contadoEnSaldoCents).toBe(50_000_00)
    expect(s.yaGastadoPendingCents).toBe(0)
  })

  it('already_expensed: true → NO cuenta en el cuadre, pero suma en yaGastadoPendingCents y en totalPendingCents', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00, already_expensed: true })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes[0].cuentaEnCuadre).toBe(false)
    expect(s.contadoEnSaldoCents).toBe(0)
    expect(s.yaGastadoPendingCents).toBe(50_000_00)
    expect(s.totalPendingCents).toBe(50_000_00)
  })

  it('deuda cobrada con already_expensed: false → deja de sumar en contadoEnSaldoCents', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 50_000_00, already_expensed: false })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 50_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.contadoEnSaldoCents).toBe(0)
    expect(s.cobradas[0].cuentaEnCuadre).toBe(false)
  })

  it('mes esperado pasado y pendiente → vencida', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-08-01' })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes[0].vencida).toBe(true)
    expect(s.vencidasCount).toBe(1)
  })

  it('mes esperado en curso → no vencida (vence al terminar el mes, no antes)', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-09-01' })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes[0].vencida).toBe(false)
  })

  it('sin mes esperado → nunca vencida, aunque sea vieja', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: null, created_at: '2020-01-01T00:00:00.000Z' })
    const s = summarizeReceivables([r], [], TODAY)
    expect(s.pendientes[0].vencida).toBe(false)
  })

  it('deuda vencida pero ya cobrada → no cuenta como vencida', () => {
    const r = makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-08-01' })
    const payments = [makeReceivablePayment({ receivable_id: 'r1', amountCents: 10_000_00 })]
    const s = summarizeReceivables([r], payments, TODAY)
    expect(s.cobradas[0].vencida).toBe(false)
    expect(s.vencidasCount).toBe(0)
  })

  it('totalLentCents y totalReturnedCents suman TODO, pendientes y cobradas por igual', () => {
    const r1 = makeReceivable({ id: 'r1', amountCents: 50_000_00 })
    const r2 = makeReceivable({ id: 'r2', amountCents: 30_000_00 })
    const payments = [
      makeReceivablePayment({ receivable_id: 'r1', amountCents: 20_000_00 }), // r1 sigue pendiente
      makeReceivablePayment({ receivable_id: 'r2', amountCents: 30_000_00 }), // r2 queda cobrada
    ]
    const s = summarizeReceivables([r1, r2], payments, TODAY)
    expect(s.totalLentCents).toBe(80_000_00)
    expect(s.totalReturnedCents).toBe(50_000_00)
  })

  it('sin deudas → totalLentCents y totalReturnedCents en 0', () => {
    const s = summarizeReceivables([], [], TODAY)
    expect(s.totalLentCents).toBe(0)
    expect(s.totalReturnedCents).toBe(0)
  })
})

describe('particionarPorHorizonte', () => {
  it('lista vacía → las dos partes vacías, sin romper', () => {
    const { esteMes, masAdelante } = particionarPorHorizonte([], TODAY)
    expect(esteMes).toEqual([])
    expect(masAdelante).toEqual([])
  })

  it('mes esperado = mes actual → esteMes', () => {
    const s = makeReceivableSummary({ pendingCents: 10_000_00, receivable: { expected_period: '2026-09-01' } })
    const { esteMes, masAdelante } = particionarPorHorizonte([s], TODAY)
    expect(esteMes).toEqual([s])
    expect(masAdelante).toEqual([])
  })

  it('mes esperado pasado (vencida) → esteMes: es lo más accionable que hay, no "más adelante"', () => {
    const s = makeReceivableSummary({ pendingCents: 10_000_00, receivable: { expected_period: '2026-07-01' } })
    const { esteMes } = particionarPorHorizonte([s], TODAY)
    expect(esteMes).toEqual([s])
  })

  it('mes esperado futuro → masAdelante', () => {
    const s = makeReceivableSummary({ pendingCents: 10_000_00, receivable: { expected_period: '2026-11-01' } })
    const { esteMes, masAdelante } = particionarPorHorizonte([s], TODAY)
    expect(esteMes).toEqual([])
    expect(masAdelante).toEqual([s])
  })

  it('sin fecha esperada → masAdelante: "no sé cuándo" no es "este mes"', () => {
    const s = makeReceivableSummary({ pendingCents: 10_000_00, receivable: { expected_period: null } })
    const { esteMes, masAdelante } = particionarPorHorizonte([s], TODAY)
    expect(esteMes).toEqual([])
    expect(masAdelante).toEqual([s])
  })

  it('no altera la lista de entrada: esteMes + masAdelante cubren todo, sin perder ni duplicar', () => {
    const items = [
      makeReceivableSummary({ pendingCents: 1_000, receivable: { expected_period: '2026-07-01' } }),
      makeReceivableSummary({ pendingCents: 2_000, receivable: { expected_period: '2026-09-01' } }),
      makeReceivableSummary({ pendingCents: 3_000, receivable: { expected_period: '2026-12-01' } }),
      makeReceivableSummary({ pendingCents: 4_000, receivable: { expected_period: null } }),
    ]
    const { esteMes, masAdelante } = particionarPorHorizonte(items, TODAY)
    expect(esteMes.length + masAdelante.length).toBe(items.length)
    expect([...esteMes, ...masAdelante].reduce((sum, s) => sum + s.pendingCents, 0)).toBe(10_000)
  })
})

describe('agruparPorMesEsperado', () => {
  it('agrupa por mes, ordenado asc, con el grupo sin fecha al final', () => {
    const receivables = [
      makeReceivable({ id: 'r1', amountCents: 10_000_00, expected_period: '2026-11-01' }),
      makeReceivable({ id: 'r2', amountCents: 20_000_00, expected_period: null }),
      makeReceivable({ id: 'r3', amountCents: 5_000_00, expected_period: '2026-10-01' }),
      makeReceivable({ id: 'r4', amountCents: 5_000_00, expected_period: '2026-10-01' }),
    ]
    const { pendientes } = summarizeReceivables(receivables, [], TODAY)
    const groups = agruparPorMesEsperado(pendientes)

    expect(groups.map((g) => g.period)).toEqual(['2026-10-01', '2026-11-01', null])
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].totalPendingCents).toBe(10_000_00)
    expect(groups[2].period).toBeNull()
  })
})
