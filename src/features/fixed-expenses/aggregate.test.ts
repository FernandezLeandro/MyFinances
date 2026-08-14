import { describe, expect, it } from 'vitest'
import { summarizeFixedExpenses } from './aggregate'
import { makeFixedExpense, makeFixedExpensePayment } from '@/test/factories'

// `new Date(2026, 7, 20)` (constructor local, mes 0-indexado) en vez de `new Date('2026-08-20')` —
// mismo gotcha documentado en `permiteActualizarPlantilla`/`projectBudget`.
const AGOSTO = new Date(2026, 7, 1)
const HOY_EN_AGOSTO = new Date(2026, 7, 20)

describe('summarizeFixedExpenses — fijo de una sola vez', () => {
  it('impago → pending, resta el total', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(1)
    expect(s.done).toHaveLength(0)
    expect(s.pending[0].remainingCents).toBe(50_000_00)
    expect(s.pendingTotalCents).toBe(50_000_00)
  })

  it('pagado → done, no resta nada', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'f1', amountPaidCents: 50_000_00 })
    const s = summarizeFixedExpenses([fe], [payment], AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(0)
    expect(s.done).toHaveLength(1)
    expect(s.done[0].paidCents).toBe(50_000_00)
    expect(s.pendingTotalCents).toBe(0)
  })
})

describe('summarizeFixedExpenses — bolsa (is_recurring)', () => {
  it('sin pagos → pending por el presupuesto entero', () => {
    const fe = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(1)
    expect(s.pending[0].remainingCents).toBe(60_000_00)
    expect(s.pending[0].overspentCents).toBe(0)
    expect(s.pendingTotalCents).toBe(60_000_00)
  })

  it('parcial → sigue pending, resta lo que falta', () => {
    const fe = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const payments = [
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 18_000_00 }),
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 22_000_00 }),
    ]
    const s = summarizeFixedExpenses([fe], payments, AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(1)
    expect(s.pending[0].paidCents).toBe(40_000_00)
    expect(s.pending[0].remainingCents).toBe(20_000_00)
    expect(s.pending[0].overspentCents).toBe(0)
    expect(s.pendingTotalCents).toBe(20_000_00)
  })

  it('justa (paidCents === cents) → done, remanente 0, sin excedente', () => {
    const fe = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 60_000_00 })
    const s = summarizeFixedExpenses([fe], [payment], AGOSTO, HOY_EN_AGOSTO)
    expect(s.done).toHaveLength(1)
    expect(s.done[0].remainingCents).toBe(0)
    expect(s.done[0].overspentCents).toBe(0)
    expect(s.pendingTotalCents).toBe(0)
  })

  it('excedida → done, remanente 0, marca el excedente, y no resta de más', () => {
    const fe = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 68_000_00 })
    const s = summarizeFixedExpenses([fe], [payment], AGOSTO, HOY_EN_AGOSTO)
    expect(s.done).toHaveLength(1)
    expect(s.done[0].remainingCents).toBe(0)
    expect(s.done[0].overspentCents).toBe(8_000_00)
    expect(s.pendingTotalCents).toBe(0)
  })

  it('mes ya cerrado, parcial → no resta nada, aunque no llegó al presupuesto', () => {
    const fe = makeFixedExpense({ id: 'mama', cents: 80_000_00, is_recurring: true })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'mama', amountPaidCents: 30_000_00 })
    const julio = new Date(2026, 6, 1)
    const s = summarizeFixedExpenses([fe], [payment], julio, HOY_EN_AGOSTO)
    expect(s.pendingTotalCents).toBe(0)
    expect(s.done).toHaveLength(1)
    expect(s.done[0].remainingCents).toBe(0)
  })

  it('mes futuro → resta el presupuesto entero como si fuera el mes en curso', () => {
    const fe = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const septiembre = new Date(2026, 8, 1)
    const s = summarizeFixedExpenses([fe], [], septiembre, HOY_EN_AGOSTO)
    expect(s.pendingTotalCents).toBe(60_000_00)
  })
})

describe('summarizeFixedExpenses — mezcla', () => {
  it('pendingTotalCents suma el remanente de fijos y bolsas por igual, ordenado por día de vencimiento', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, due_day: 10 })
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 15 })
    const payments = [makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 18_000_00 })]

    const s = summarizeFixedExpenses([internet, nafta, alquiler], payments, AGOSTO, HOY_EN_AGOSTO)

    expect(s.pending.map((p) => p.fe.id)).toEqual(['alquiler', 'nafta', 'internet'])
    expect(s.pendingTotalCents).toBe(450_000_00 + 42_000_00 + 35_000_00)
  })

  it('un fijo pausado (is_active=false) no aparece', () => {
    const fe = makeFixedExpense({ id: 'f1', is_active: false })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(0)
    expect(s.done).toHaveLength(0)
  })
})
