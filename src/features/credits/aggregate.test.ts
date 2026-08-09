import { describe, expect, it } from 'vitest'
import { summarizeCard, summarizeCredits } from './aggregate'
import { makeCard, makeInstallment, makePayment, makeSaving } from '@/test/factories'

describe('summarizeCard', () => {
  it('tarjeta sin cuotas este mes → total 0 y porcentaje 0, no NaN', () => {
    const card = makeCard({ id: 'c1' })
    const s = summarizeCard(card, [], [], [])
    expect(s.totalCents).toBe(0)
    expect(s.savedPercent).toBe(0)
    expect(s.missingCents).toBe(0)
    expect(s.paid).toBe(false)
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

  it('tarjeta con pago registrado este período → paid true', () => {
    const card = makeCard({ id: 'c1' })
    const payments = [makePayment({ card_id: 'c1' })]
    const s = summarizeCard(card, [], [], payments)
    expect(s.paid).toBe(true)
  })
})

describe('summarizeCredits', () => {
  it('pendiente y guardado suman sólo tarjetas no pagadas — lo guardado de una ya pagada no cuenta', () => {
    const cardA = makeCard({ id: 'a' })
    const cardB = makeCard({ id: 'b' })
    const items = [
      makeInstallment({ card_id: 'a', amountCents: 10_000 }),
      makeInstallment({ card_id: 'b', amountCents: 20_000 }),
    ]
    const savings = [makeSaving({ card_id: 'a', amountCents: 4_000 }), makeSaving({ card_id: 'b', amountCents: 6_000 })]
    const payments = [makePayment({ card_id: 'b' })] // b ya está pagada

    const summary = summarizeCredits([cardA, cardB], items, savings, payments)

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
    const summary = summarizeCredits([cardA], items, savings, [])
    expect(summary.totalMissingCents).toBe(0)
  })

  it('sin tarjetas → resumen vacío sin romper', () => {
    const summary = summarizeCredits([], [], [], [])
    expect(summary.perCard).toEqual([])
    expect(summary.totalPendingCents).toBe(0)
    expect(summary.totalSavedCents).toBe(0)
    expect(summary.totalMissingCents).toBe(0)
  })
})
