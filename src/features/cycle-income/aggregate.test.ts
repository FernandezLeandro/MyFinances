import { describe, expect, it } from 'vitest'
import { isCycleIncome, isRemovableFromDialog } from './aggregate'
import { makeTransaction } from '@/test/factories'

// HO-10 del QA de Hoy: "Sueldo asignado" (tarjeta) y "Asignado este ciclo" (diálogo) usaban dos
// definiciones distintas de "ingreso del ciclo" — la tarjeta excluía ajustes, el diálogo no. Este
// test fija que `isCycleIncome` es la MISMA regla que `v_range_summary.total_income`
// (`type = 'income' and not is_adjustment`), para que las dos pantallas nunca puedan volver a
// desincronizarse.
describe('isCycleIncome', () => {
  it('ingreso sin ajuste → true', () => {
    const tx = makeTransaction({ id: 't1', cents: 10_000, occurred_on: '2026-09-05', type: 'income' })
    expect(isCycleIncome(tx)).toBe(true)
  })

  it('ingreso marcado como ajuste → false (no es plata "cobrada" este ciclo)', () => {
    const tx = makeTransaction({
      id: 't1',
      cents: 10_000,
      occurred_on: '2026-09-05',
      type: 'income',
      is_adjustment: true,
    })
    expect(isCycleIncome(tx)).toBe(false)
  })

  it('gasto → false, aunque no sea ajuste', () => {
    const tx = makeTransaction({ id: 't1', cents: 10_000, occurred_on: '2026-09-05', type: 'expense' })
    expect(isCycleIncome(tx)).toBe(false)
  })

  it('suma exactamente lo mismo que sumaría v_range_summary.total_income', () => {
    const txs = [
      makeTransaction({ id: 't1', cents: 100_00, occurred_on: '2026-09-01', type: 'income' }), // cuenta
      makeTransaction({ id: 't2', cents: 200_00, occurred_on: '2026-09-02', type: 'income', is_adjustment: true }), // no cuenta
      makeTransaction({ id: 't3', cents: 50_00, occurred_on: '2026-09-03', type: 'expense' }), // no cuenta
    ]
    const total = txs.filter(isCycleIncome).reduce((sum, tx) => sum + tx.cents, 0)
    expect(total).toBe(100_00)
  })
})

// HO-11 del QA de Hoy: la X del diálogo de Sueldo borraba cualquier fila al toque, sin distinguir un
// sueldo cargado ahí de un ingreso con vida propia en otro lado (un ajuste histórico de Cuentas, en
// el caso real del informe).
describe('isRemovableFromDialog', () => {
  it('lo que arma "Asignar sueldo" (sin categoría, sin pago de fijo) → removible', () => {
    const tx = makeTransaction({ id: 't1', cents: 10_000, occurred_on: '2026-09-05', type: 'income' })
    expect(isRemovableFromDialog(tx)).toBe(true)
  })

  it('con categoría (cargado desde Movimientos o Me Deben) → no removible', () => {
    const tx = makeTransaction({
      id: 't1',
      cents: 10_000,
      occurred_on: '2026-09-05',
      type: 'income',
      category_id: 'cat-1',
    })
    expect(isRemovableFromDialog(tx)).toBe(false)
  })

  it('con fixed_expense_payment_id (vino de pagar un fijo) → no removible', () => {
    const tx = makeTransaction({
      id: 't1',
      cents: 10_000,
      occurred_on: '2026-09-05',
      type: 'income',
      fixed_expense_payment_id: 'fep-1',
    })
    expect(isRemovableFromDialog(tx)).toBe(false)
  })
})
