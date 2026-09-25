import { describe, expect, it } from 'vitest'
import { summarizeCard, summarizeMisDeudas, summarizePurchase } from './aggregate'
import { makeCard, makeInstallment, makePayment, makePurchase, makePurchasePayment, makeSaving } from '@/test/factories'

describe('summarizeCard', () => {
  it('tarjeta sin cuotas este mes → total 0 y porcentaje 0, no NaN', () => {
    const card = makeCard({ id: 'c1' })
    const s = summarizeCard(card, [], [], [])
    expect(s.totalCents).toBe(0)
    expect(s.savedPercent).toBe(0)
    expect(s.missingCents).toBe(0)
    expect(s.paid).toBe(false)
    // HO-03 del QA de Hoy: sin ítems, `hasDue` es `false` — `paid: false` acá NO significa "deuda
    // impaga", significa "no hay nada que pagar este período".
    expect(s.hasDue).toBe(false)
  })

  it('tarjeta con cuotas este mes → hasDue true', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 10_000 })]
    const s = summarizeCard(card, items, [], [])
    expect(s.hasDue).toBe(true)
  })

  it('suma las cuotas de la tarjeta, ignora las de otras tarjetas', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 10_000 }),
      makeInstallment({ card_id: 'c1', amountCents: 5_000 }),
      makeInstallment({ card_id: 'c2', amountCents: 99_999 }),
    ]
    const s = summarizeCard(card, items, [], [])
    expect(s.totalCents).toBe(15_000)
    expect(s.items).toHaveLength(2)
  })

  it('ordena los ítems por monto descendente', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 1_000, description: 'Chico' }),
      makeInstallment({ card_id: 'c1', amountCents: 9_000, description: 'Grande' }),
    ]
    const s = summarizeCard(card, items, [], [])
    expect(s.items.map((i) => i.description)).toEqual(['Grande', 'Chico'])
  })

  it('guardado > total → falta clampeado en 0 y porcentaje en 100', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 10_000 })]
    const savings = [makeSaving({ card_id: 'c1', amountCents: 50_000 })]
    const s = summarizeCard(card, items, savings, [])
    expect(s.missingCents).toBe(0)
    expect(s.savedPercent).toBe(100)
  })

  it('guardado parcial → falta y porcentaje correctos', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 20_000 })]
    const savings = [makeSaving({ card_id: 'c1', amountCents: 15_000 })]
    const s = summarizeCard(card, items, savings, [])
    expect(s.missingCents).toBe(5_000)
    expect(s.savedPercent).toBe(75)
  })

  it('tarjeta con pago registrado este período → paid true y expone paidAt', () => {
    const card = makeCard({ id: 'c1' })
    const payments = [makePayment({ card_id: 'c1', paid_at: '2026-09-03T12:00:00Z' })]
    const s = summarizeCard(card, [], [], payments)
    expect(s.paid).toBe(true)
    expect(s.paidAt).toBe('2026-09-03T12:00:00Z')
  })

  it('tarjeta sin pago este período → paidAt null', () => {
    const card = makeCard({ id: 'c1' })
    const s = summarizeCard(card, [], [], [])
    expect(s.paidAt).toBeNull()
  })
})

describe('summarizeCard — dos períodos en la misma vista (bloque 5, ciclo semanal a caballo de dos meses)', () => {
  it('un solo período con su pago propio → pagada (comportamiento de siempre)', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 10_000, period: '2026-09-01' })]
    const payments = [makePayment({ card_id: 'c1', period: '2026-09-01' })]
    const s = summarizeCard(card, items, [], payments)
    expect(s.paid).toBe(true)
  })

  it('dos períodos, sólo uno con pago → NO pagada — antes (match sólo por card_id) daba pagada de más', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 10_000, period: '2026-09-01' }),
      makeInstallment({ card_id: 'c1', amountCents: 12_000, period: '2026-10-01' }),
    ]
    const payments = [makePayment({ card_id: 'c1', period: '2026-09-01' })] // sólo septiembre pagado
    const s = summarizeCard(card, items, [], payments)
    expect(s.paid).toBe(false)
  })

  it('dos períodos, los dos con pago → pagada', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 10_000, period: '2026-09-01' }),
      makeInstallment({ card_id: 'c1', amountCents: 12_000, period: '2026-10-01' }),
    ]
    const payments = [
      makePayment({ card_id: 'c1', period: '2026-09-01' }),
      makePayment({ card_id: 'c1', period: '2026-10-01' }),
    ]
    const s = summarizeCard(card, items, [], payments)
    expect(s.paid).toBe(true)
  })

  it('dueOn toma el vencimiento más próximo entre los ítems', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 10_000, due_on: '2026-10-02' }),
      makeInstallment({ card_id: 'c1', amountCents: 12_000, due_on: '2026-09-30' }),
    ]
    const s = summarizeCard(card, items, [], [])
    expect(s.dueOn).toBe('2026-09-30')
  })
})

describe('summarizePurchase', () => {
  it('compra con cuota este período → totalCents de la cuota, no pagada', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000 })]
    const s = summarizePurchase(purchase, items, [])
    expect(s.item).not.toBeNull()
    expect(s.totalCents).toBe(8_000)
    expect(s.paid).toBe(false)
  })

  it('compra sin cuota este período (ya se apagó o no arrancó) → item null y total 0', () => {
    const purchase = makePurchase({ id: 'p1' })
    const s = summarizePurchase(purchase, [], [])
    expect(s.item).toBeNull()
    expect(s.totalCents).toBe(0)
  })

  it('compra con pago registrado este período → paid true', () => {
    const purchase = makePurchase({ id: 'p1' })
    const payments = [makePurchasePayment({ purchase_id: 'p1' })]
    const s = summarizePurchase(purchase, [], payments)
    expect(s.paid).toBe(true)
  })

  // Bloque 5 del plan: con dos períodos en la misma vista (semana a caballo de dos meses), un pago
  // del OTRO período no debe marcar como pagada la cuota de éste.
  it('la cuota tiene un período distinto al del pago existente → NO pagada', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000, period: '2026-10-01' })]
    const payments = [makePurchasePayment({ purchase_id: 'p1', period: '2026-09-01' })]
    const s = summarizePurchase(purchase, items, payments)
    expect(s.paid).toBe(false)
  })

  it('dueOn expone el vencimiento materializado de la cuota', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000, due_on: '2026-10-02' })]
    const s = summarizePurchase(purchase, items, [])
    expect(s.dueOn).toBe('2026-10-02')
  })
})

describe('summarizeMisDeudas', () => {
  it('pendiente y guardado suman sólo tarjetas no pagadas — lo guardado de una ya pagada no cuenta', () => {
    const cardA = makeCard({ id: 'a' })
    const cardB = makeCard({ id: 'b' })
    const items = [
      makeInstallment({ card_id: 'a', amountCents: 10_000 }),
      makeInstallment({ card_id: 'b', amountCents: 20_000 }),
    ]
    const savings = [makeSaving({ card_id: 'a', amountCents: 4_000 }), makeSaving({ card_id: 'b', amountCents: 6_000 })]
    const payments = [makePayment({ card_id: 'b' })] // b ya está pagada

    const summary = summarizeMisDeudas([cardA, cardB], [], items, savings, payments, [])

    // Sólo la deuda de A (no pagada) cuenta como pendiente — B ya salió del saldo vía la transacción.
    expect(summary.totalPendingCents).toBe(10_000)
    // Lo guardado de B (pagada) no ayuda a cubrir nada pendiente — marcar pagada no toca los ahorros,
    // así que esa plata quedó "huérfana" y no debe inflar el "Guardado" del panel general.
    expect(summary.totalSavedCents).toBe(4_000)
    expect(summary.totalMissingCents).toBe(6_000)
    expect(summary.perCard).toHaveLength(2)
    // La tarjeta pagada sigue mostrando su propio total, aunque no sume al pendiente global.
    expect(summary.perCard.find((c) => c.card.id === 'b')?.totalCents).toBe(20_000)
  })

  it('lo guardado nunca supera lo pendiente → falta clampeada en 0', () => {
    const cardA = makeCard({ id: 'a' })
    const items = [makeInstallment({ card_id: 'a', amountCents: 5_000 })]
    const savings = [makeSaving({ card_id: 'a', amountCents: 9_000 })]
    const summary = summarizeMisDeudas([cardA], [], items, savings, [], [])
    expect(summary.totalMissingCents).toBe(0)
  })

  it('sin tarjetas ni compras sueltas → resumen vacío sin romper', () => {
    const summary = summarizeMisDeudas([], [], [], [], [], [])
    expect(summary.perCard).toEqual([])
    expect(summary.standalone).toEqual([])
    expect(summary.totalPendingCents).toBe(0)
    expect(summary.totalSavedCents).toBe(0)
    expect(summary.totalMissingCents).toBe(0)
    expect(summary.unpaidCount).toBe(0)
  })

  // HO-03 del QA de Hoy: una tarjeta sin ninguna compra en el ciclo (sin ítems, sin pago) contaba
  // como deuda impaga de $0 e inflaba "Deudas por pagar" — `unpaidCount` no debe contarla.
  it('tarjeta sin cuotas este período no cuenta como deuda impaga, aunque paid dé false', () => {
    const empty = makeCard({ id: 'vacia' })
    const withDue = makeCard({ id: 'con-cuota' })
    const items = [makeInstallment({ card_id: 'con-cuota', amountCents: 10_000 })]

    const summary = summarizeMisDeudas([empty, withDue], [], items, [], [], [])

    expect(summary.perCard.find((c) => c.card.id === 'vacia')?.paid).toBe(false)
    expect(summary.perCard.find((c) => c.card.id === 'vacia')?.hasDue).toBe(false)
    // Sólo la tarjeta con cuota real cuenta.
    expect(summary.unpaidCount).toBe(1)
    expect(summary.totalPendingCents).toBe(10_000)
  })

  it('tarjeta pagada con cuota → no cuenta en unpaidCount; compra suelta impaga sí', () => {
    const paid = makeCard({ id: 'pagada' })
    const items = [makeInstallment({ card_id: 'pagada', amountCents: 5_000 })]
    const payments = [makePayment({ card_id: 'pagada' })]
    const purchase = makePurchase({ id: 'p1' })
    const purchaseItems = [...items, makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 3_000 })]

    const summary = summarizeMisDeudas([paid], [purchase], purchaseItems, [], payments, [])

    expect(summary.unpaidCount).toBe(1)
  })

  it('compras sueltas pendientes suman al total, sin aportar a lo guardado', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 7_000 })]

    const summary = summarizeMisDeudas([], [purchase], items, [], [], [])

    expect(summary.standalone).toHaveLength(1)
    expect(summary.totalPendingCents).toBe(7_000)
    expect(summary.totalSavedCents).toBe(0)
    expect(summary.totalMissingCents).toBe(7_000)
  })

  it('compra suelta ya pagada no suma al pendiente, y una sin cuota este mes no aparece en la lista', () => {
    const paid = makePurchase({ id: 'p1' })
    const noItemThisMonth = makePurchase({ id: 'p2' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 3_000 })]
    const payments = [makePurchasePayment({ purchase_id: 'p1' })]

    const summary = summarizeMisDeudas([], [paid, noItemThisMonth], items, [], [], payments)

    expect(summary.standalone).toHaveLength(1)
    expect(summary.totalPendingCents).toBe(0)
  })
})
