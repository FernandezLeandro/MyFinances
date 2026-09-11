import { describe, expect, it } from 'vitest'
import { dailySpendBars, summarizeTransactions } from './aggregate'
import { makeTransaction } from '@/test/factories'

// Constructor local (mes 0-indexado), no `new Date('2026-09-05')` — mismo gotcha documentado en
// `permiteActualizarPlantilla`.
const HOY_5_SEPT = new Date(2026, 8, 5)

describe('summarizeTransactions', () => {
  it('separa ingresos y gastos, netea, y cuenta cada tipo', () => {
    const txs = [
      makeTransaction({ id: 't1', type: 'income', cents: 100_000_00, occurred_on: '2026-09-01' }),
      makeTransaction({ id: 't2', type: 'expense', cents: 30_000_00, occurred_on: '2026-09-02' }),
      makeTransaction({ id: 't3', type: 'expense', cents: 20_000_00, occurred_on: '2026-09-03' }),
    ]
    const s = summarizeTransactions(txs, '2026-09-01', '2026-09-30', HOY_5_SEPT)
    expect(s.totalIncomeCents).toBe(100_000_00)
    expect(s.totalExpenseCents).toBe(50_000_00)
    expect(s.netCents).toBe(50_000_00)
    expect(s.incomeCount).toBe(1)
    expect(s.expenseCount).toBe(2)
  })

  it('ignora los ajustes de saldo — no son plata que se fue', () => {
    const txs = [
      makeTransaction({ id: 't1', type: 'expense', cents: 10_000_00, occurred_on: '2026-09-01', is_adjustment: true }),
      makeTransaction({ id: 't2', type: 'expense', cents: 5_000_00, occurred_on: '2026-09-02' }),
    ]
    const s = summarizeTransactions(txs, '2026-09-01', '2026-09-30', HOY_5_SEPT)
    expect(s.totalExpenseCents).toBe(5_000_00)
    expect(s.expenseCount).toBe(1)
  })

  it('promedio diario: sobre los días transcurridos del mes en curso, no sobre el mes entero', () => {
    // Hoy es el 5 de septiembre — van 5 días transcurridos (1 al 5 inclusive).
    const txs = [makeTransaction({ id: 't1', type: 'expense', cents: 50_000_00, occurred_on: '2026-09-03' })]
    const s = summarizeTransactions(txs, '2026-09-01', '2026-09-30', HOY_5_SEPT)
    expect(s.daysElapsed).toBe(5)
    expect(s.dailyAverageExpenseCents).toBe(10_000_00)
  })

  it('promedio diario: un mes ya cerrado promedia sobre el mes entero', () => {
    const agosto = [makeTransaction({ id: 't1', type: 'expense', cents: 62_000_00, occurred_on: '2026-08-15' })]
    const s = summarizeTransactions(agosto, '2026-08-01', '2026-08-31', HOY_5_SEPT)
    expect(s.daysElapsed).toBe(31)
    expect(s.dailyAverageExpenseCents).toBe(Math.round(62_000_00 / 31))
  })

  it('un período que todavía no arrancó da 0 días y 0 de promedio', () => {
    const s = summarizeTransactions([], '2026-10-01', '2026-10-31', HOY_5_SEPT)
    expect(s.daysElapsed).toBe(0)
    expect(s.dailyAverageExpenseCents).toBe(0)
  })
})

describe('dailySpendBars', () => {
  it('un slot por día del rango, sin huecos, sumando sólo gastos', () => {
    const txs = [
      makeTransaction({ id: 't1', type: 'expense', cents: 10_000_00, occurred_on: '2026-09-02' }),
      makeTransaction({ id: 't2', type: 'expense', cents: 5_000_00, occurred_on: '2026-09-02' }),
      makeTransaction({ id: 't3', type: 'income', cents: 100_000_00, occurred_on: '2026-09-03' }),
    ]
    const bars = dailySpendBars(txs, '2026-09-01', '2026-09-04')
    expect(bars).toEqual([
      { day: 1, cents: 0 },
      { day: 2, cents: 15_000_00 },
      { day: 3, cents: 0 },
      { day: 4, cents: 0 },
    ])
  })

  it('un ajuste de saldo no cuenta como gasto del día', () => {
    const txs = [makeTransaction({ id: 't1', type: 'expense', cents: 10_000_00, occurred_on: '2026-09-01', is_adjustment: true })]
    const bars = dailySpendBars(txs, '2026-09-01', '2026-09-01')
    expect(bars).toEqual([{ day: 1, cents: 0 }])
  })
})
