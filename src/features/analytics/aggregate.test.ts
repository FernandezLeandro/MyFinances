import { describe, expect, it } from 'vitest'
import { summarizeCategoryMonthlyAverages, summarizeFijoVsVariable } from './aggregate'
import { makeTransaction } from '@/test/factories'

describe('summarizeFijoVsVariable', () => {
  it('sin transacciones → todo en 0, sin NaN', () => {
    const s = summarizeFijoVsVariable([], new Set())
    expect(s.committedCents).toBe(0)
    expect(s.variableCents).toBe(0)
    expect(s.committedPct).toBe(0)
    expect(s.variablePct).toBe(0)
  })

  it('pago de fijo (fixed_expense_payment_id) → comprometido', () => {
    const tx = makeTransaction({ id: 't1', cents: 10_000, occurred_on: '2026-09-05', fixed_expense_payment_id: 'p1' })
    const s = summarizeFijoVsVariable([tx], new Set())
    expect(s.committedCents).toBe(10_000)
    expect(s.variableCents).toBe(0)
  })

  it('pago de tarjeta (is_credit_card_payment) → comprometido', () => {
    const tx = makeTransaction({ id: 't1', cents: 20_000, occurred_on: '2026-09-05', is_credit_card_payment: true })
    const s = summarizeFijoVsVariable([tx], new Set())
    expect(s.committedCents).toBe(20_000)
  })

  it('pago de compra sin tarjeta (por transaction_id, sin flag propio) → comprometido', () => {
    const tx = makeTransaction({ id: 't1', cents: 5_000, occurred_on: '2026-09-05' })
    const s = summarizeFijoVsVariable([tx], new Set(['t1']))
    expect(s.committedCents).toBe(5_000)
    expect(s.variableCents).toBe(0)
  })

  it('gasto suelto sin ninguna marca → variable', () => {
    const tx = makeTransaction({ id: 't1', cents: 8_000, occurred_on: '2026-09-05' })
    const s = summarizeFijoVsVariable([tx], new Set())
    expect(s.variableCents).toBe(8_000)
    expect(s.committedCents).toBe(0)
  })

  it('ingresos se ignoran, aunque vengan en la lista', () => {
    const income = makeTransaction({ id: 't1', cents: 100_000, occurred_on: '2026-09-05', type: 'income' })
    const expense = makeTransaction({ id: 't2', cents: 8_000, occurred_on: '2026-09-05' })
    const s = summarizeFijoVsVariable([income, expense], new Set())
    expect(s.totalCents).toBe(8_000)
  })

  it('porcentajes redondeados y suman 100', () => {
    const committed = makeTransaction({ id: 't1', cents: 76_000, occurred_on: '2026-09-05', is_credit_card_payment: true })
    const variable = makeTransaction({ id: 't2', cents: 24_000, occurred_on: '2026-09-05' })
    const s = summarizeFijoVsVariable([committed, variable], new Set())
    expect(s.committedPct).toBe(76)
    expect(s.variablePct).toBe(24)
  })
})

describe('summarizeCategoryMonthlyAverages', () => {
  const cat = (categoryId: string, cents: number) => ({ categoryId, categoryName: 'Cat ' + categoryId, color: '#000', cents })

  it('serie vacía → lista vacía', () => {
    expect(summarizeCategoryMonthlyAverages([])).toEqual([])
  })

  it('promedio sobre TODOS los meses, no sólo los que tuvieron gasto', () => {
    const months = [
      [cat('c1', 30_000)],
      [cat('c1', 0)],
      [cat('c1', 0)],
    ]
    const [row] = summarizeCategoryMonthlyAverages(months)
    expect(row!.avgCents).toBe(10_000) // 30.000 / 3, no / 1
  })

  it('nowCents es el último mes de la serie', () => {
    const months = [[cat('c1', 5_000)], [cat('c1', 15_000)]]
    const [row] = summarizeCategoryMonthlyAverages(months)
    expect(row!.nowCents).toBe(15_000)
  })

  it('desvío positivo cuando el mes actual gastó más que el promedio', () => {
    const months = [[cat('c1', 10_000)], [cat('c1', 10_000)], [cat('c1', 13_000)]]
    const [row] = summarizeCategoryMonthlyAverages(months)
    // avg = (10000+10000+13000)/3 = 11000; dev = (13000-11000)/11000*100 ≈ 18%
    expect(row!.deviationPct).toBe(18)
  })

  it('promedio en 0 → deviationPct null, no división por cero', () => {
    const months = [[cat('c1', 0)], [cat('c1', 5_000)]]
    const [row] = summarizeCategoryMonthlyAverages(months)
    expect(row!.avgCents).toBe(2_500)
    expect(row!.deviationPct).not.toBeNull()
    const months2 = [[cat('c1', 0)], [cat('c1', 0)]]
    expect(summarizeCategoryMonthlyAverages(months2)).toEqual([])
  })

  it('categoría sin actividad en ningún mes de la serie no aparece', () => {
    const months = [[cat('c1', 1_000), cat('c2', 0)], [cat('c1', 2_000), cat('c2', 0)]]
    const rows = summarizeCategoryMonthlyAverages(months)
    expect(rows.map((r) => r.categoryId)).toEqual(['c1'])
  })

  it('ordena por gasto del último mes, descendente', () => {
    const months = [[cat('c1', 1_000), cat('c2', 5_000)]]
    const rows = summarizeCategoryMonthlyAverages(months)
    expect(rows.map((r) => r.categoryId)).toEqual(['c2', 'c1'])
  })
})
