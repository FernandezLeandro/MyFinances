import { describe, expect, it } from 'vitest'
import {
  dailySpendBars,
  dailySpendPeakLabel,
  dayNetTotals,
  mergeMovementList,
  movementCategoryLabel,
  movementCountLabel,
  summarizeTransactions,
  transferAccountsLabel,
  transferDirection,
  transfersForList,
  transferSignedCents,
  type TransferListFilters,
} from './aggregate'
import { makeTransaction, makeTransfer } from '@/test/factories'

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
      { date: '2026-09-01', day: 1, cents: 0 },
      { date: '2026-09-02', day: 2, cents: 15_000_00 },
      { date: '2026-09-03', day: 3, cents: 0 },
      { date: '2026-09-04', day: 4, cents: 0 },
    ])
  })

  it('un ajuste de saldo no cuenta como gasto del día', () => {
    const txs = [makeTransaction({ id: 't1', type: 'expense', cents: 10_000_00, occurred_on: '2026-09-01', is_adjustment: true })]
    const bars = dailySpendBars(txs, '2026-09-01', '2026-09-01')
    expect(bars).toEqual([{ date: '2026-09-01', day: 1, cents: 0 }])
  })

  // Bloque 5 del plan: con ciclo semanal, el rango puede cruzar el borde del mes — antes esto daba
  // dos barras con `day: 1` y `day: 2` (una de cada mes) indistinguibles entre sí; ahora cada una
  // lleva su fecha completa.
  it('cruzando el borde del mes: cada barra lleva su propia fecha, sin días repetidos como clave', () => {
    const bars = dailySpendBars([], '2026-09-29', '2026-10-02')
    expect(bars.map((b) => b.date)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(bars.map((b) => b.day)).toEqual([29, 30, 1, 2])
  })
})

describe('dailySpendPeakLabel', () => {
  it('sólo el día cuando el rango no cruza de mes', () => {
    expect(dailySpendPeakLabel({ date: '2026-09-05', day: 5, cents: 100 }, true)).toBe('5')
  })

  it('día y mes cuando el rango cruza de mes — evita la ambigüedad de dos "día 2" distintos', () => {
    expect(dailySpendPeakLabel({ date: '2026-10-02', day: 2, cents: 100 }, false)).toBe('2 oct')
  })
})

describe('movementCategoryLabel', () => {
  it('un ajuste de saldo se distingue de un gasto común, sin importar la categoría', () => {
    expect(movementCategoryLabel({ is_adjustment: true, is_credit_card_payment: false }, 'Servicios')).toBe(
      'Ajuste de saldo · afuera de Análisis',
    )
  })

  it('un pago de tarjeta suma "· Tarjeta" a la categoría', () => {
    expect(movementCategoryLabel({ is_adjustment: false, is_credit_card_payment: true }, 'Servicios')).toBe('Servicios · Tarjeta')
  })

  it('sin categoría, dice "Sin categoría"', () => {
    expect(movementCategoryLabel({ is_adjustment: false, is_credit_card_payment: false }, undefined)).toBe('Sin categoría')
  })

  it('el caso común: sólo la categoría', () => {
    expect(movementCategoryLabel({ is_adjustment: false, is_credit_card_payment: false }, 'Supermercado')).toBe('Supermercado')
  })
})

// Regresión de N7 (re-test de QA): un "Ajuste de saldo" (típicamente de "Dejar de usar Cuentas",
// millones de pesos) se sumaba al subtotal del día como si fuera un gasto real.
describe('dayNetTotals', () => {
  it('excluye los ajustes del neto del día', () => {
    const gasto = makeTransaction({ id: 't1', occurred_on: '2026-09-05', type: 'expense', cents: 10_00 })
    const ajuste = makeTransaction({ id: 't2', occurred_on: '2026-09-05', type: 'expense', cents: 3_000_000_00, is_adjustment: true })
    const totals = dayNetTotals([gasto, ajuste])
    expect(totals.get('2026-09-05')).toBe(-10_00)
  })

  it('un día con SÓLO un ajuste no aparece en el mapa (nada real que sumar)', () => {
    const ajuste = makeTransaction({ id: 't1', occurred_on: '2026-09-05', type: 'income', cents: 100_00, is_adjustment: true })
    expect(dayNetTotals([ajuste]).has('2026-09-05')).toBe(false)
  })

  it('sin ajustes de por medio, se comporta igual que sumar todo (comportamiento previo intacto)', () => {
    const a = makeTransaction({ id: 't1', occurred_on: '2026-09-05', type: 'income', cents: 50_00 })
    const b = makeTransaction({ id: 't2', occurred_on: '2026-09-05', type: 'expense', cents: 20_00 })
    expect(dayNetTotals([a, b]).get('2026-09-05')).toBe(30_00)
  })
})

// ---------------------------------------------------------------------------------------------
// Transferencias en la lista de Movimientos
// ---------------------------------------------------------------------------------------------

const BANCO = 'acc-banco'
const EFECTIVO = 'acc-efectivo'
const MP = 'acc-mp'

/** Banco → Efectivo, $50.000, el 10 de septiembre. */
const bancoAEfectivo = makeTransfer({ id: 'tr1', from_account_id: BANCO, to_account_id: EFECTIVO, cents: 50_000_00, occurred_on: '2026-09-10' })

const SIN_FILTROS: TransferListFilters = { from: '2026-09-01', to: '2026-09-30', type: 'all', categoryIds: [], accountIds: [] }

describe('transferDirection / transferSignedCents', () => {
  it('sin filtro de cuenta es interna: no suma ni resta', () => {
    expect(transferDirection(bancoAEfectivo, [])).toBe('internal')
    expect(transferSignedCents(bancoAEfectivo, [])).toBe(0)
  })

  it('filtrando por el origen, sale: negativo', () => {
    expect(transferDirection(bancoAEfectivo, [BANCO])).toBe('out')
    expect(transferSignedCents(bancoAEfectivo, [BANCO])).toBe(-50_000_00)
  })

  it('filtrando por el destino, entra: positivo', () => {
    expect(transferDirection(bancoAEfectivo, [EFECTIVO])).toBe('in')
    expect(transferSignedCents(bancoAEfectivo, [EFECTIVO])).toBe(50_000_00)
  })

  it('con las dos puntas filtradas es interna: la plata no sale del conjunto', () => {
    expect(transferDirection(bancoAEfectivo, [BANCO, EFECTIVO])).toBe('internal')
    expect(transferSignedCents(bancoAEfectivo, [EFECTIVO, BANCO])).toBe(0)
  })

  it('el origen filtrado junto con «Sin cuenta» sigue siendo salida', () => {
    expect(transferSignedCents(bancoAEfectivo, ['', BANCO])).toBe(-50_000_00)
  })
})

describe('transferAccountsLabel', () => {
  it('filtrando por una punta muestra sólo la otra — la filtrada ya se sabe', () => {
    expect(transferAccountsLabel('in', 'Banco', 'Efectivo')).toBe('desde Banco')
    expect(transferAccountsLabel('out', 'Banco', 'Efectivo')).toBe('a Efectivo')
  })

  it('sin filtro, o con las dos puntas, muestra las dos', () => {
    expect(transferAccountsLabel('internal', 'Banco', 'Efectivo')).toBe('Banco → Efectivo')
  })
})

describe('transfersForList', () => {
  it('sin filtros entra toda transferencia del período, y sólo las del período', () => {
    const agosto = makeTransfer({ id: 'tr0', from_account_id: BANCO, to_account_id: EFECTIVO, cents: 1_00, occurred_on: '2026-08-31' })
    const octubre = makeTransfer({ id: 'tr2', from_account_id: BANCO, to_account_id: EFECTIVO, cents: 1_00, occurred_on: '2026-10-01' })
    const bordes = [
      makeTransfer({ id: 'tr3', from_account_id: BANCO, to_account_id: EFECTIVO, cents: 1_00, occurred_on: '2026-09-01' }),
      makeTransfer({ id: 'tr4', from_account_id: BANCO, to_account_id: EFECTIVO, cents: 1_00, occurred_on: '2026-09-30' }),
    ]
    const ids = transfersForList([agosto, bancoAEfectivo, octubre, ...bordes], SIN_FILTROS).map((t) => t.id)
    expect(ids).toEqual(['tr1', 'tr3', 'tr4'])
  })

  it('con «Gastos» o «Ingresos» no entra ninguna: no son gasto ni ingreso', () => {
    expect(transfersForList([bancoAEfectivo], { ...SIN_FILTROS, type: 'expense' })).toEqual([])
    expect(transfersForList([bancoAEfectivo], { ...SIN_FILTROS, type: 'income' })).toEqual([])
  })

  it('con alguna categoría filtrada no entra ninguna: no tienen categoría', () => {
    expect(transfersForList([bancoAEfectivo], { ...SIN_FILTROS, categoryIds: ['cat-super'] })).toEqual([])
  })

  it('filtrando por cuenta entran las que tocan alguna cuenta filtrada, por cualquiera de sus puntas', () => {
    const mpAEfectivo = makeTransfer({ id: 'tr2', from_account_id: MP, to_account_id: EFECTIVO, cents: 1_00, occurred_on: '2026-09-11' })
    const mpABanco = makeTransfer({ id: 'tr3', from_account_id: MP, to_account_id: BANCO, cents: 1_00, occurred_on: '2026-09-12' })
    const all = [bancoAEfectivo, mpAEfectivo, mpABanco]
    expect(transfersForList(all, { ...SIN_FILTROS, accountIds: [BANCO] }).map((t) => t.id)).toEqual(['tr1', 'tr3'])
    expect(transfersForList(all, { ...SIN_FILTROS, accountIds: [EFECTIVO] }).map((t) => t.id)).toEqual(['tr1', 'tr2'])
  })

  it('filtrando sólo «Sin cuenta» no entra ninguna: una transferencia siempre tiene sus dos cuentas', () => {
    expect(transfersForList([bancoAEfectivo], { ...SIN_FILTROS, accountIds: [''] })).toEqual([])
  })

  it('la búsqueda mira la descripción sin distinguir mayúsculas; sin descripción no coincide', () => {
    const cajero = makeTransfer({ ...bancoAEfectivo, id: 'tr2', description: 'Retiro del Cajero' })
    expect(transfersForList([bancoAEfectivo, cajero], { ...SIN_FILTROS, text: 'cajero' }).map((t) => t.id)).toEqual(['tr2'])
  })

  it('con el tope de filas alcanzado, deja afuera las anteriores al movimiento más viejo que se trajo', () => {
    const vieja = makeTransfer({ ...bancoAEfectivo, id: 'tr0', occurred_on: '2026-09-03' })
    const mismoDia = makeTransfer({ ...bancoAEfectivo, id: 'tr2', occurred_on: '2026-09-05' })
    const ids = transfersForList([vieja, mismoDia, bancoAEfectivo], { ...SIN_FILTROS, truncatedBefore: '2026-09-05' }).map((t) => t.id)
    expect(ids).toEqual(['tr2', 'tr1'])
  })
})

describe('mergeMovementList', () => {
  it('ordena por fecha y, el mismo día, por hora de carga — lo más nuevo primero', () => {
    const gastoTemprano = makeTransaction({ id: 'g1', cents: 1_00, occurred_on: '2026-09-10', created_at: '2026-09-10T09:00:00+00:00' })
    const gastoTarde = makeTransaction({ id: 'g2', cents: 1_00, occurred_on: '2026-09-10', created_at: '2026-09-10T20:00:00+00:00' })
    const gastoViejo = makeTransaction({ id: 'g3', cents: 1_00, occurred_on: '2026-09-02', created_at: '2026-09-02T12:00:00+00:00' })
    const transfer = makeTransfer({ ...bancoAEfectivo, created_at: '2026-09-10T12:00:00+00:00' })
    const items = mergeMovementList([gastoTarde, gastoTemprano, gastoViejo], [transfer])
    expect(items.map((i) => i.key)).toEqual(['tx:g2', 'transfer:tr1', 'tx:g1', 'tx:g3'])
  })

  it('un movimiento y una transferencia con el mismo id no chocan como clave', () => {
    const tx = makeTransaction({ id: 'mismo', cents: 1_00, occurred_on: '2026-09-10' })
    const transfer = makeTransfer({ ...bancoAEfectivo, id: 'mismo' })
    const keys = mergeMovementList([tx], [transfer]).map((i) => i.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('dayNetTotals con transferencias', () => {
  const gasto = makeTransaction({ id: 'g1', occurred_on: '2026-09-10', type: 'expense', cents: 2_000_00, account_id: EFECTIVO })

  it('sin filtro de cuenta una transferencia no mueve el total del día', () => {
    expect(dayNetTotals([gasto], [bancoAEfectivo], []).get('2026-09-10')).toBe(-2_000_00)
  })

  it('filtrando por el destino, lo que entró suma al total del día', () => {
    expect(dayNetTotals([gasto], [bancoAEfectivo], [EFECTIVO]).get('2026-09-10')).toBe(48_000_00)
  })

  it('filtrando por el origen, lo que salió resta — aunque ese día no haya movimientos', () => {
    expect(dayNetTotals([], [bancoAEfectivo], [BANCO]).get('2026-09-10')).toBe(-50_000_00)
  })

  it('un día con sólo una transferencia interna no aparece en el mapa', () => {
    expect(dayNetTotals([], [bancoAEfectivo], []).has('2026-09-10')).toBe(false)
  })
})

describe('movementCountLabel', () => {
  it('sin transferencias, como siempre', () => {
    expect(movementCountLabel(12, 0)).toBe('12 movimientos')
    expect(movementCountLabel(1, 0)).toBe('1 movimiento')
    expect(movementCountLabel(0, 0)).toBe('0 movimientos')
  })

  it('con transferencias, las cuenta aparte', () => {
    expect(movementCountLabel(12, 2)).toBe('12 movimientos y 2 transferencias')
    expect(movementCountLabel(1, 1)).toBe('1 movimiento y 1 transferencia')
  })

  it('sólo transferencias: no dice «0 movimientos»', () => {
    expect(movementCountLabel(0, 3)).toBe('3 transferencias')
  })
})
