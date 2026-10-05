import { describe, expect, it } from 'vitest'
import { debtList, paymentGroups, summarizeCard, summarizeMisDeudas, summarizePurchase } from './aggregate'
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

  it('el guardado de la tarjeta es la suma de lo guardado en sus compras', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', purchase_id: 'p1', amountCents: 20_000 }),
      makeInstallment({ card_id: 'c1', purchase_id: 'p2', amountCents: 10_000 }),
    ]
    const savings = [
      makeSaving({ purchase_id: 'p1', amountCents: 5_000 }),
      makeSaving({ purchase_id: 'p1', amountCents: 3_000, transaction_id: 'tx-1' }),
      makeSaving({ purchase_id: 'p2', amountCents: 4_000 }),
      makeSaving({ purchase_id: 'otra', amountCents: 99_000 }),
    ]
    const s = summarizeCard(card, items, savings, [])
    expect(s.savedCents).toBe(12_000)
    expect(s.missingCents).toBe(18_000)
    expect(s.savedPercent).toBe(40)
    expect(s.items.find((i) => i.purchase_id === 'p1')?.savings).toHaveLength(2)
  })

  // Regla: todo lo guardado descuenta del pago, tenga movimiento o no — el movimiento sólo decide
  // cuándo baja el saldo. Antes un guardado "aparte" no bajaba lo pendiente: debía 400, guardaba 200
  // aparte y el pago generaba 400.
  it('todo guardado baja lo pendiente, con o sin movimiento', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', purchase_id: 'aparte', amountCents: 40_000 }),
      makeInstallment({ card_id: 'c1', purchase_id: 'con-mov', amountCents: 10_000 }),
    ]
    const savings = [
      makeSaving({ purchase_id: 'aparte', amountCents: 20_000 }),
      makeSaving({ purchase_id: 'con-mov', amountCents: 4_000, transaction_id: 'tx-1' }),
    ]
    const s = summarizeCard(card, items, savings, [])
    expect(s.items.find((i) => i.purchase_id === 'aparte')?.pendingCents).toBe(20_000)
    expect(s.items.find((i) => i.purchase_id === 'con-mov')?.pendingCents).toBe(6_000)
    expect(s.pendingCents).toBe(26_000)
  })

  it('guardado de otro período no cuenta para la cuota de éste', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', purchase_id: 'p1', amountCents: 10_000, period: '2026-09-01' })]
    const savings = [makeSaving({ purchase_id: 'p1', amountCents: 10_000, period: '2026-08-01', transaction_id: 'tx-1' })]
    const s = summarizeCard(card, items, savings, [])
    expect(s.savedCents).toBe(0)
    expect(s.pendingCents).toBe(10_000)
  })

  it('guardado de más → falta y pendiente clampeados en 0, porcentaje en 100', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', purchase_id: 'p1', amountCents: 10_000 })]
    const savings = [makeSaving({ purchase_id: 'p1', amountCents: 50_000, transaction_id: 'tx-1' })]
    const s = summarizeCard(card, items, savings, [])
    expect(s.missingCents).toBe(0)
    expect(s.pendingCents).toBe(0)
    expect(s.savedPercent).toBe(100)
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

  it('tarjeta sin día de vencimiento → dueOn null (sin urgencia), aunque la cuota caiga a fin de mes', () => {
    const card = makeCard({ id: 'c1', due_day: null })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 10_000, due_on: '2026-08-31' })]
    const s = summarizeCard(card, items, [], [])
    expect(s.dueOn).toBeNull()
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
    const s = summarizePurchase(purchase, items, [], [])
    expect(s.item).not.toBeNull()
    expect(s.totalCents).toBe(8_000)
    expect(s.paid).toBe(false)
  })

  it('compra sin cuota este período (ya se apagó o no arrancó) → item null y total 0', () => {
    const purchase = makePurchase({ id: 'p1' })
    const s = summarizePurchase(purchase, [], [], [])
    expect(s.item).toBeNull()
    expect(s.totalCents).toBe(0)
  })

  it('compra con pago registrado este período → paid true', () => {
    const purchase = makePurchase({ id: 'p1' })
    const payments = [makePurchasePayment({ purchase_id: 'p1' })]
    const s = summarizePurchase(purchase, [], [], payments)
    expect(s.paid).toBe(true)
  })

  // Bloque 5 del plan: con dos períodos en la misma vista (semana a caballo de dos meses), un pago
  // del OTRO período no debe marcar como pagada la cuota de éste.
  it('la cuota tiene un período distinto al del pago existente → NO pagada', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000, period: '2026-10-01' })]
    const payments = [makePurchasePayment({ purchase_id: 'p1', period: '2026-09-01' })]
    const s = summarizePurchase(purchase, items, [], payments)
    expect(s.paid).toBe(false)
  })

  it('dueOn expone el vencimiento materializado de la cuota', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000, due_on: '2026-10-02' })]
    const s = summarizePurchase(purchase, items, [], [])
    expect(s.dueOn).toBe('2026-10-02')
  })

  it('compra sin día de vencimiento → dueOn null', () => {
    const purchase = makePurchase({ id: 'p1', due_day: null })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000, due_on: '2026-08-31' })]
    const s = summarizePurchase(purchase, items, [], [])
    expect(s.dueOn).toBeNull()
  })

  it('compra sin tarjeta también se guarda: todo lo guardado baja lo pendiente', () => {
    const purchase = makePurchase({ id: 'p1' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 8_000 })]
    const savings = [
      makeSaving({ purchase_id: 'p1', amountCents: 3_000, transaction_id: 'tx-1' }),
      makeSaving({ purchase_id: 'p1', amountCents: 1_000 }),
    ]
    const s = summarizePurchase(purchase, items, savings, [])
    expect(s.savedCents).toBe(4_000)
    expect(s.pendingCents).toBe(4_000)
  })
})

describe('summarizeMisDeudas', () => {
  it('a pagar y guardado suman sólo lo no pagado — lo guardado de una tarjeta ya pagada no cuenta', () => {
    const cardA = makeCard({ id: 'a' })
    const cardB = makeCard({ id: 'b' })
    const items = [
      makeInstallment({ card_id: 'a', purchase_id: 'pa', amountCents: 10_000 }),
      makeInstallment({ card_id: 'b', purchase_id: 'pb', amountCents: 20_000 }),
    ]
    const savings = [makeSaving({ purchase_id: 'pa', amountCents: 4_000 }), makeSaving({ purchase_id: 'pb', amountCents: 6_000 })]
    const payments = [makePayment({ card_id: 'b' })] // b ya está pagada

    const summary = summarizeMisDeudas([cardA, cardB], [], items, savings, payments, [])

    expect(summary.totalDueCents).toBe(10_000)
    expect(summary.totalSavedCents).toBe(4_000)
    expect(summary.totalMissingCents).toBe(6_000)
    expect(summary.perCard).toHaveLength(2)
    // La tarjeta pagada sigue mostrando su propio total, aunque no sume al pendiente global.
    expect(summary.perCard.find((c) => c.card.id === 'b')?.totalCents).toBe(20_000)
  })

  // Espejo de `rpc_projected_balance_range` (`credit_saving_covered`): el pago va a generar sólo lo que
  // falta después de todo lo guardado, con o sin movimiento — «Deudas por pagar» resta lo mismo para
  // que el desglose del proyectado cierre.
  it('totalPendingCents es neto de todo lo guardado, con o sin movimiento', () => {
    const card = makeCard({ id: 'a' })
    const items = [
      makeInstallment({ card_id: 'a', purchase_id: 'p1', amountCents: 10_000 }),
      makeInstallment({ card_id: 'a', purchase_id: 'p2', amountCents: 10_000 }),
    ]
    const savings = [
      makeSaving({ purchase_id: 'p1', amountCents: 10_000, transaction_id: 'tx-1' }),
      makeSaving({ purchase_id: 'p2', amountCents: 5_000 }),
    ]
    const summary = summarizeMisDeudas([card], [], items, savings, [], [])
    expect(summary.totalDueCents).toBe(20_000)
    expect(summary.totalSavedCents).toBe(15_000)
    expect(summary.totalPendingCents).toBe(5_000)
  })

  it('guardar de más en una deuda no cubre otra → guardado capado por deuda', () => {
    const cardA = makeCard({ id: 'a' })
    const purchase = makePurchase({ id: 's1' })
    const items = [
      makeInstallment({ card_id: 'a', purchase_id: 'pa', amountCents: 5_000 }),
      makeInstallment({ card_id: null, purchase_id: 's1', amountCents: 5_000 }),
    ]
    const savings = [makeSaving({ purchase_id: 'pa', amountCents: 9_000 })]
    const summary = summarizeMisDeudas([cardA], [purchase], items, savings, [], [])
    expect(summary.totalSavedCents).toBe(5_000)
    expect(summary.totalMissingCents).toBe(5_000)
  })

  it('sin tarjetas ni compras sueltas → resumen vacío sin romper', () => {
    const summary = summarizeMisDeudas([], [], [], [], [], [])
    expect(summary.perCard).toEqual([])
    expect(summary.standalone).toEqual([])
    expect(summary.totalDueCents).toBe(0)
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

  it('compra suelta ya pagada no suma al pendiente, y una sin cuota este mes no aparece en la lista', () => {
    const paid = makePurchase({ id: 'p1' })
    const noItemThisMonth = makePurchase({ id: 'p2' })
    const items = [makeInstallment({ card_id: null, purchase_id: 'p1', amountCents: 3_000 })]
    const payments = [makePurchasePayment({ purchase_id: 'p1' })]

    const summary = summarizeMisDeudas([], [paid, noItemThisMonth], items, [], [], payments)

    expect(summary.standalone).toHaveLength(1)
    expect(summary.totalPendingCents).toBe(0)
    expect(summary.totalDueCents).toBe(0)
  })
})

describe('debtList', () => {
  it('mezcla tarjetas y compras sueltas: por vencimiento, sin día al final, tarjeta sin cuotas última', () => {
    const vence20 = makeCard({ id: 'c20', name: 'Visa', due_day: 20 })
    const sinDia = makeCard({ id: 'c-sin', name: 'Master', due_day: null })
    const vacia = makeCard({ id: 'c-vacia', name: 'Amex' })
    const suelta = makePurchase({ id: 'p5', description: 'Heladera', due_day: 5 })
    const items = [
      makeInstallment({ card_id: 'c20', amountCents: 1_000, due_on: '2026-08-20' }),
      makeInstallment({ card_id: 'c-sin', amountCents: 1_000, due_on: '2026-08-31' }),
      makeInstallment({ card_id: null, purchase_id: 'p5', amountCents: 1_000, due_on: '2026-08-05' }),
    ]
    const summary = summarizeMisDeudas([vence20, sinDia, vacia], [suelta], items, [], [], [])
    const { unpaid, paid } = debtList(summary)
    expect(unpaid.map((d) => (d.kind === 'card' ? d.summary.card.name : d.summary.purchase.description))).toEqual([
      'Heladera',
      'Visa',
      'Master',
      'Amex',
    ])
    expect(paid).toEqual([])
  })

  it('las pagadas van aparte', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', amountCents: 1_000 })]
    const summary = summarizeMisDeudas([card], [], items, [], [makePayment({ card_id: 'c1' })], [])
    const { unpaid, paid } = debtList(summary)
    expect(unpaid).toEqual([])
    expect(paid).toHaveLength(1)
  })
})

describe('paymentGroups', () => {
  // Pedido de Leandro: pagar sigue armando un movimiento por categoría, pero sólo por las compras que
  // todavía no tienen guardada la totalidad — con o sin movimiento, todo lo guardado descuenta.
  it('un movimiento por categoría, por lo que le falta a cada compra; las cubiertas quedan afuera', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', purchase_id: 'perfume', amountCents: 63_000, category_id: 'personales' }),
      makeInstallment({ card_id: 'c1', purchase_id: 'puma', amountCents: 44_000, category_id: 'ropa' }),
      makeInstallment({ card_id: 'c1', purchase_id: 'atomik', amountCents: 33_000, category_id: 'ropa' }),
      makeInstallment({ card_id: 'c1', purchase_id: 'super', amountCents: 34_000, category_id: 'super' }),
      makeInstallment({ card_id: 'c1', purchase_id: 'cafe', amountCents: 5_000, category_id: 'super' }),
    ]
    const savings = [
      makeSaving({ purchase_id: 'puma', amountCents: 44_000, transaction_id: 'tx-1' }), // cubierta con movimiento
      makeSaving({ purchase_id: 'atomik', amountCents: 13_000, transaction_id: 'tx-2' }), // en parte, con movimiento
      makeSaving({ purchase_id: 'super', amountCents: 24_000 }), // en parte, aparte
      makeSaving({ purchase_id: 'cafe', amountCents: 5_000 }), // cubierta, aparte
    ]
    const { items: saved } = summarizeCard(card, items, savings, [])
    const { groups, covered } = paymentGroups(saved)

    expect(groups.map((g) => [g.categoryId, g.totalCents])).toEqual([
      ['personales', 63_000],
      ['ropa', 20_000],
      ['super', 10_000],
    ])
    expect(groups.find((g) => g.categoryId === 'ropa')?.items.map((i) => i.purchase_id)).toEqual(['atomik'])
    expect(groups.find((g) => g.categoryId === 'super')?.items.map((i) => i.purchase_id)).toEqual(['super'])
    expect(covered.map((i) => i.purchase_id)).toEqual(['puma', 'cafe'])
  })

  it('categoría con todas sus compras cubiertas → no genera movimiento', () => {
    const card = makeCard({ id: 'c1' })
    const items = [makeInstallment({ card_id: 'c1', purchase_id: 'p1', amountCents: 10_000, category_id: 'ropa' })]
    const savings = [makeSaving({ purchase_id: 'p1', amountCents: 10_000, transaction_id: 'tx-1' })]
    const { groups, covered } = paymentGroups(summarizeCard(card, items, savings, []).items)
    expect(groups).toEqual([])
    expect(covered).toHaveLength(1)
  })

  it('sin categoría también agrupa (null es su propio grupo, igual que en la base)', () => {
    const card = makeCard({ id: 'c1' })
    const items = [
      makeInstallment({ card_id: 'c1', amountCents: 1_000, category_id: null }),
      makeInstallment({ card_id: 'c1', amountCents: 2_000, category_id: null }),
    ]
    const { groups } = paymentGroups(summarizeCard(card, items, [], []).items)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ categoryId: null, totalCents: 3_000 })
  })
})
