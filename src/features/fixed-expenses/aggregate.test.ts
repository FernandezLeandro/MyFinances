import { describe, expect, it } from 'vitest'
import { cycleContaining, type CycleConfig } from '@/lib/cycle'
import { compareFixedExpenses, fixedExpenseUrgency, summarizeFixedExpenses } from './aggregate'
import { makeFixedExpense, makeFixedExpensePayment } from '@/test/factories'

// `new Date(2026, 7, 20)` (constructor local, mes 0-indexado) en vez de `new Date('2026-08-20')` —
// mismo gotcha documentado en `permiteActualizarPlantilla`.
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
  it('pendingTotalCents suma el remanente de fijos y bolsas por igual, recurrentes primero', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, due_day: null })
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 15 })
    const payments = [makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 18_000_00 })]

    const s = summarizeFixedExpenses([internet, nafta, alquiler], payments, AGOSTO, HOY_EN_AGOSTO)

    expect(s.pending.map((p) => p.fe.id)).toEqual(['nafta', 'alquiler', 'internet'])
    expect(s.pendingTotalCents).toBe(450_000_00 + 42_000_00 + 35_000_00)
  })

  it('un fijo pausado (is_active=false) no aparece', () => {
    const fe = makeFixedExpense({ id: 'f1', is_active: false })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(0)
    expect(s.done).toHaveLength(0)
  })
})

describe('summarizeFixedExpenses — con cycle (bloque 3 del plan de ciclos)', () => {
  const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }
  const biweekly: CycleConfig = { kind: 'biweekly', weekStartsOn: 1 }

  it('sin cycle, el comportamiento es idéntico al de siempre (Fijos.tsx no lo pasa)', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const withoutCycle = summarizeFixedExpenses([alquiler], [], AGOSTO, HOY_EN_AGOSTO)
    expect(withoutCycle.pendingTotalCents).toBe(450_000_00)
  })

  it('con cycle mensual, no cambia nada — no-op de retrocompatibilidad', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const cycle = cycleContaining(monthly, HOY_EN_AGOSTO)
    const s = summarizeFixedExpenses([alquiler], [], AGOSTO, HOY_EN_AGOSTO, cycle)
    expect(s.pendingTotalCents).toBe(450_000_00)
  })

  it('con cycle quincenal, un fijo que vence en la otra quincena no cuenta en esta', () => {
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 20 }) // segunda quincena
    const firstHalf = cycleContaining(biweekly, new Date(2026, 7, 5, 12))
    const s = summarizeFixedExpenses([internet], [], AGOSTO, HOY_EN_AGOSTO, firstHalf)
    expect(s.pending).toHaveLength(0)
    expect(s.pendingTotalCents).toBe(0)
  })

  it('telescopía: las dos quincenas del mes suman exactamente lo que sumaba el mes entero — agarra un doble descuento', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 20 })
    const expenses = [alquiler, internet]

    const wholeMonth = summarizeFixedExpenses(expenses, [], AGOSTO, HOY_EN_AGOSTO)
    const firstHalf = summarizeFixedExpenses(expenses, [], AGOSTO, HOY_EN_AGOSTO, cycleContaining(biweekly, new Date(2026, 7, 5, 12)))
    const secondHalf = summarizeFixedExpenses(expenses, [], AGOSTO, HOY_EN_AGOSTO, cycleContaining(biweekly, new Date(2026, 7, 20, 12)))

    expect(firstHalf.pendingTotalCents + secondHalf.pendingTotalCents).toBe(wholeMonth.pendingTotalCents)
  })

  it('una bolsa sigue contando entera en cualquier quincena del mes (todavía 100% mensual)', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, due_day: null })
    const firstHalf = cycleContaining(biweekly, new Date(2026, 7, 5, 12))
    const s = summarizeFixedExpenses([nafta], [], AGOSTO, HOY_EN_AGOSTO, firstHalf)
    expect(s.pendingTotalCents).toBe(60_000_00)
  })
})

describe('compareFixedExpenses', () => {
  it('pone todos los recurrentes antes que los de una sola vez', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', due_day: 5 })
    const internet = makeFixedExpense({ id: 'internet', due_day: 1 })
    const nafta = makeFixedExpense({ id: 'nafta', is_recurring: true, due_day: null, name: 'Nafta' })
    const comida = makeFixedExpense({ id: 'comida', is_recurring: true, due_day: null, name: 'Comida' })

    const sorted = [alquiler, internet, nafta, comida].sort(compareFixedExpenses)

    expect(sorted.map((fe) => fe.id)).toEqual(['comida', 'nafta', 'internet', 'alquiler'])
  })
})

describe('fixedExpenseUrgency', () => {
  // Hoy es el 20 en estos tres casos.
  it('rojo cuando ya venció este mes', () => {
    expect(fixedExpenseUrgency(15, HOY_EN_AGOSTO)).toBe('red')
    expect(fixedExpenseUrgency(19, HOY_EN_AGOSTO)).toBe('red')
  })

  it('ámbar dentro de los próximos 7 días, hoy incluido', () => {
    expect(fixedExpenseUrgency(20, HOY_EN_AGOSTO)).toBe('amber')
    expect(fixedExpenseUrgency(26, HOY_EN_AGOSTO)).toBe('amber')
  })

  it('neutro más allá de 7 días', () => {
    expect(fixedExpenseUrgency(27, HOY_EN_AGOSTO)).toBe('neutral')
    expect(fixedExpenseUrgency(31, HOY_EN_AGOSTO)).toBe('neutral')
  })
})

describe('summarizeFixedExpenses — con window extendido más allá del mes mirado (decisión de scoping)', () => {
  const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }

  // Documenta a propósito la decisión tomada al conectar Fijos.tsx: pasarle a `summarizeFixedExpenses`
  // un `window` que cruza a un mes ANTERIOR al mirado (el horizonte de `projectionWindow`) NO debe
  // hacer que esta función intente sumar la instancia de ese mes anterior — sólo tiene `payments` del
  // mes que se está mirando, así que no podría saber si esa instancia vieja está pagada o no. Sumarla
  // igual (asumiendo impaga) desincroniza el desglose visible del headline del RPC (que sí la suma,
  // correctamente, con sus propios pagos) en la dirección opuesta — ver Fijos.tsx para el detalle.
  // Si esta prueba empieza a fallar porque alguien "arregló" la función para mirar el mes anterior,
  // hace falta además traer los pagos de ESE mes — no alcanza con ensanchar el filtro de fecha.
  it('un window que arranca un mes antes del mirado no duplica ni agrega la instancia del mes anterior', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5, starts_on: '2026-01-01' })
    // AGOSTO es el mes mirado; el window arranca en julio (como haría `projectionWindow` si "hoy"
    // estuviera en julio y se estuviera mirando agosto hacia adelante).
    const windowDesdeJulio = { from: '2026-07-01', to: '2026-08-31' }
    const soloAgosto = cycleContaining(monthly, HOY_EN_AGOSTO)

    const conWindowExtendido = summarizeFixedExpenses([alquiler], [], AGOSTO, HOY_EN_AGOSTO, windowDesdeJulio)
    const conCicloPropio = summarizeFixedExpenses([alquiler], [], AGOSTO, HOY_EN_AGOSTO, soloAgosto)

    // Mismo resultado: sólo la instancia de agosto, una vez — nunca $900.000 (las dos instancias).
    expect(conWindowExtendido.pendingTotalCents).toBe(450_000_00)
    expect(conCicloPropio.pendingTotalCents).toBe(450_000_00)
    expect(conWindowExtendido.pending).toHaveLength(1)
  })
})
