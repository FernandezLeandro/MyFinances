import { describe, expect, it } from 'vitest'
import { TRANSACTION_QUERY_KEYS } from './queryKeys'

describe('TRANSACTION_QUERY_KEYS', () => {
  it('incluye range-summary — regresión: Ingresos/Gastos de Hoy quedaban viejos tras cargar un movimiento', () => {
    expect(TRANSACTION_QUERY_KEYS).toContain('range-summary')
  })

  it('cubre el saldo, el proyectado y el saldo por cuenta, que suman los mismos movimientos', () => {
    expect(TRANSACTION_QUERY_KEYS).toEqual(
      expect.arrayContaining(['transactions', 'balance', 'projected-balance-range', 'account-balances']),
    )
  })
})
