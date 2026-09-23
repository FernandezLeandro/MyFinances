import { describe, expect, it } from 'vitest'
import { TRANSACTION_QUERY_KEYS, TRANSFER_QUERY_KEYS } from './queryKeys'

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

describe('TRANSFER_QUERY_KEYS', () => {
  // Regresión: borrar una transferencia sólo invalidaba la lista y el saldo por cuenta. Con una punta
  // archivada (que no suma al saldo) el saldo global sí cambia, y su consulta quedaba sin invalidar.
  // No se llegaba a ver porque Hoy, Fijos y Mis Deudas lo vuelven a pedir al abrirse (`staleTime` 0),
  // pero dependía de eso.
  it('incluye el saldo global y el proyectado', () => {
    expect(TRANSFER_QUERY_KEYS).toEqual(expect.arrayContaining(['balance', 'projected-balance-range']))
  })

  it('incluye la lista de transferencias y el saldo por cuenta', () => {
    expect(TRANSFER_QUERY_KEYS).toEqual(expect.arrayContaining(['account-transfers', 'account-balances']))
  })
})
