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

  // Regresión de N7 (re-test de QA): un ajuste de saldo tipo gasto (ej. al "Dejar de usar Cuentas",
  // montos de millones) contaba entero como "variable" — no es una decisión de gasto real.
  it('un ajuste de saldo no cuenta ni como comprometido ni como variable', () => {
    const gasto = makeTransaction({ id: 't1', cents: 8_000, occurred_on: '2026-09-05' })
    const ajuste = makeTransaction({ id: 't2', cents: 3_000_000_00, occurred_on: '2026-09-05', is_adjustment: true })
    const s = summarizeFijoVsVariable([gasto, ajuste], new Set())
    expect(s.totalCents).toBe(8_000)
    expect(s.variableCents).toBe(8_000)
  })
})

describe('summarizeCategoryMonthlyAverages', () => {
  const cat = (categoryId: string, cents: number) => ({ categoryId, categoryName: 'Cat ' + categoryId, color: '#000', cents })

  it('serie vacía → lista vacía, monthsCounted 0', () => {
    expect(summarizeCategoryMonthlyAverages([])).toEqual({ rows: [], monthsCounted: 0 })
  })

  it('promedio SOLO sobre los meses con actividad en la cuenta, no sobre toda la serie', () => {
    // Los dos meses en 0 no tienen NINGÚN movimiento en la cuenta — no cuentan en el divisor.
    const months = [
      [cat('c1', 30_000)],
      [cat('c1', 0)],
      [cat('c1', 0)],
    ]
    const { rows, monthsCounted } = summarizeCategoryMonthlyAverages(months)
    expect(monthsCounted).toBe(1)
    expect(rows[0]!.avgCents).toBe(30_000) // 30.000 / 1, no / 3
  })

  it('mes con actividad en OTRA categoría cuenta en el divisor, aunque esta esté en 0', () => {
    // c1 sólo gastó en el mes 1; c2 tuvo actividad los tres meses → los tres meses cuentan.
    const months = [
      [cat('c1', 30_000), cat('c2', 5_000)],
      [cat('c1', 0), cat('c2', 5_000)],
      [cat('c1', 0), cat('c2', 5_000)],
    ]
    const { rows, monthsCounted } = summarizeCategoryMonthlyAverages(months)
    expect(monthsCounted).toBe(3)
    const c1 = rows.find((r) => r.categoryId === 'c1')
    expect(c1!.avgCents).toBe(10_000) // 30.000 / 3 — una categoría esporádica promedia bajo, a propósito
  })

  it('nowCents es el último mes de la serie', () => {
    const months = [[cat('c1', 5_000)], [cat('c1', 15_000)]]
    const { rows } = summarizeCategoryMonthlyAverages(months)
    expect(rows[0]!.nowCents).toBe(15_000)
  })

  it('desvío positivo cuando el mes actual gastó más que el promedio', () => {
    const months = [[cat('c1', 10_000)], [cat('c1', 10_000)], [cat('c1', 13_000)]]
    const { rows } = summarizeCategoryMonthlyAverages(months)
    // avg = (10000+10000+13000)/3 = 11000; dev = (13000-11000)/11000*100 ≈ 18%
    expect(rows[0]!.deviationPct).toBe(18)
  })

  it('promedio en 0 → deviationPct null, no división por cero', () => {
    // El mes 1 ([c1:0]) no tiene NINGUNA actividad en la cuenta y no cuenta en el divisor — sólo
    // cuenta el mes 2, así que avg = 5.000 / 1, no 5.000 / 2.
    const months = [[cat('c1', 0)], [cat('c1', 5_000)]]
    const { rows } = summarizeCategoryMonthlyAverages(months)
    expect(rows[0]!.avgCents).toBe(5_000)
    expect(rows[0]!.deviationPct).not.toBeNull()

    const months2 = [[cat('c1', 0)], [cat('c1', 0)]]
    expect(summarizeCategoryMonthlyAverages(months2)).toEqual({ rows: [], monthsCounted: 0 })
  })

  it('categoría sin actividad en ningún mes de la serie no aparece', () => {
    const months = [[cat('c1', 1_000), cat('c2', 0)], [cat('c1', 2_000), cat('c2', 0)]]
    const { rows } = summarizeCategoryMonthlyAverages(months)
    expect(rows.map((r) => r.categoryId)).toEqual(['c1'])
  })

  it('ordena por gasto del último mes, descendente', () => {
    const months = [[cat('c1', 1_000), cat('c2', 5_000)]]
    const { rows } = summarizeCategoryMonthlyAverages(months)
    expect(rows.map((r) => r.categoryId)).toEqual(['c2', 'c1'])
  })
})
