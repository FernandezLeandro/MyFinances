import { describe, expect, it } from 'vitest'
import { format, parseISO, subDays } from 'date-fns'
import { cycleContaining, type CycleConfig } from '@/lib/cycle'
import {
  amountAfterCopy,
  compareFixedExpenses,
  fixedExpenseUrgency,
  preAccountsPaymentCopy,
  removeLinkedMovementCopy,
  summarizeFixedExpenses,
} from './aggregate'
import { makeFixedExpense, makeFixedExpensePayment, makeFixedExpenseSaving } from '@/test/factories'

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

describe('summarizeFixedExpenses — bolsa quincenal (bag_frequency, bloque 4 del plan)', () => {
  // HOY_EN_AGOSTO es el 20 → segunda quincena (16–31). Mediodía UTC en los `paid_at`, mismo criterio
  // que `cycleContaining(..., new Date(2026, 7, 5, 12))` en el describe de arriba, para no depender
  // de la zona horaria de quien corre los tests.
  it('mes en curso: sólo cuenta lo cargado en la quincena de HOY, no la otra', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, bag_frequency: 'biweekly' })
    const payments = [
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 15_000_00, paid_at: '2026-08-05T12:00:00.000Z' }), // 1ª quincena — no cuenta
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 22_000_00, paid_at: '2026-08-18T12:00:00.000Z' }), // 2ª quincena — cuenta
    ]
    const s = summarizeFixedExpenses([nafta], payments, AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending[0].paidCents).toBe(22_000_00)
    expect(s.pending[0].remainingCents).toBe(38_000_00)
    expect(s.pending[0].payments).toHaveLength(1)
  })

  it('mes en curso, la quincena vigente completa el presupuesto → done, sin importar lo cargado en la otra', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, bag_frequency: 'biweekly' })
    const payments = [
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 60_000_00, paid_at: '2026-08-05T12:00:00.000Z' }), // 1ª quincena
      makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 10_000_00, paid_at: '2026-08-18T12:00:00.000Z' }), // 2ª quincena, parcial
    ]
    const s = summarizeFixedExpenses([nafta], payments, AGOSTO, HOY_EN_AGOSTO)
    expect(s.pending).toHaveLength(1)
    expect(s.pending[0].remainingCents).toBe(50_000_00)
  })

  it('mes ya cerrado → remanente 0 igual que una bolsa mensual, sin mirar quincenas', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, bag_frequency: 'biweekly' })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'nafta', amountPaidCents: 10_000_00, paid_at: '2026-07-18T12:00:00.000Z' })
    const julio = new Date(2026, 6, 1)
    const s = summarizeFixedExpenses([nafta], [payment], julio, HOY_EN_AGOSTO)
    expect(s.done[0].remainingCents).toBe(0)
  })

  it('mes futuro → presupuesto entero, igual que una bolsa mensual (todavía no hay quincena "futura")', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, bag_frequency: 'biweekly' })
    const septiembre = new Date(2026, 8, 1)
    const s = summarizeFixedExpenses([nafta], [], septiembre, HOY_EN_AGOSTO)
    expect(s.pendingTotalCents).toBe(60_000_00)
  })
})

describe('summarizeFixedExpenses — bolsa semanal (bag_frequency, bloque 5 del plan)', () => {
  const weekly: CycleConfig = { kind: 'weekly', weekStartsOn: 1 }
  const semanaDeHoy = cycleContaining(weekly, HOY_EN_AGOSTO)
  // Un timestamp a mediodía DENTRO de la semana de hoy, y otro FUERA (una semana antes) — sin
  // asumir qué día de la semana es HOY_EN_AGOSTO, para no acoplar el test a esa fecha en particular.
  const dentroDeLaSemana = `${semanaDeHoy.from}T12:00:00.000Z`
  const antesDeLaSemana = `${format(subDays(parseISO(semanaDeHoy.from), 3), 'yyyy-MM-dd')}T12:00:00.000Z`

  it('mes en curso: sólo cuenta lo cargado en la semana de HOY, no la anterior — y respeta weekStartsOn', () => {
    const comida = makeFixedExpense({ id: 'comida', cents: 30_000_00, is_recurring: true, bag_frequency: 'weekly' })
    const payments = [
      makeFixedExpensePayment({ fixed_expense_id: 'comida', amountPaidCents: 9_000_00, paid_at: antesDeLaSemana }),
      makeFixedExpensePayment({ fixed_expense_id: 'comida', amountPaidCents: 12_000_00, paid_at: dentroDeLaSemana }),
    ]
    const s = summarizeFixedExpenses([comida], payments, AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1)
    expect(s.pending[0].paidCents).toBe(12_000_00)
    expect(s.pending[0].remainingCents).toBe(18_000_00)
  })

  it('weekStartsOn se pasa correctamente a la ventana semanal — coincide con lo que calcula cycleContaining para cualquier offset', () => {
    const domingo: CycleConfig = { kind: 'weekly', weekStartsOn: 0 }
    const semanaDomingo = cycleContaining(domingo, HOY_EN_AGOSTO)
    const comida = makeFixedExpense({ id: 'comida', cents: 30_000_00, is_recurring: true, bag_frequency: 'weekly' })
    // Una carga justo en el borde de inicio de la semana "lunes" (`semanaDeHoy`, weekStartsOn=1) —
    // con weekStartsOn=0 cuenta sólo si esa fecha también cae dentro de la semana "domingo". No
    // asume qué día es HOY_EN_AGOSTO: el resultado esperado sale del mismo `cycleContaining` que ya
    // prueba `cycle.test.ts`, así que esto sólo verifica que `weekStartsOn` llega hasta acá.
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'comida', amountPaidCents: 12_000_00, paid_at: dentroDeLaSemana })
    const s = summarizeFixedExpenses([comida], [payment], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 0)
    const deberiaContar = semanaDeHoy.from >= semanaDomingo.from && semanaDeHoy.from <= semanaDomingo.to
    expect(s.pending[0].paidCents).toBe(deberiaContar ? 12_000_00 : 0)
  })

  it('mes cerrado → remanente 0 igual que las otras bolsas', () => {
    const comida = makeFixedExpense({ id: 'comida', cents: 30_000_00, is_recurring: true, bag_frequency: 'weekly' })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'comida', amountPaidCents: 5_000_00, paid_at: dentroDeLaSemana })
    const julio = new Date(2026, 6, 1)
    const s = summarizeFixedExpenses([comida], [payment], julio, HOY_EN_AGOSTO)
    expect(s.done[0].remainingCents).toBe(0)
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

  it('con cycle quincenal, un fijo que vence en la otra quincena (más adelante) no cuenta en esta', () => {
    // Mirando la PRIMERA quincena, uno que vence en la segunda (más tarde) no se adelanta — el
    // ensanchado de `withMonthCarry` sólo estira el borde de ABAJO de la ventana, nunca el de arriba.
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 20 }) // segunda quincena
    const firstHalf = cycleContaining(biweekly, new Date(2026, 7, 5, 12))
    const s = summarizeFixedExpenses([internet], [], AGOSTO, HOY_EN_AGOSTO, firstHalf)
    expect(s.pending).toHaveLength(0)
    expect(s.pendingTotalCents).toBe(0)
  })

  // Regresión de N2 (re-test de QA): un fijo IMPAGO vencido en la quincena ANTERIOR del mismo mes
  // desaparecía al mirar la quincena siguiente, en vez de arrastrarse como atrasado.
  it('con cycle quincenal, un fijo IMPAGO vencido en la quincena anterior se arrastra a ésta', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 }) // primera quincena
    const secondHalf = cycleContaining(biweekly, new Date(2026, 7, 20, 12))
    const s = summarizeFixedExpenses([alquiler], [], AGOSTO, HOY_EN_AGOSTO, secondHalf)
    expect(s.pending).toHaveLength(1)
    expect(s.pendingTotalCents).toBe(450_000_00)
  })

  // Mismo caso, pero YA PAGADO en la primera quincena: `payments` se pide por MES (no por mitad de
  // mes, ver `useFixedExpensePayments`), así que ya están disponibles al mirar la segunda — no
  // vuelve a aparecer como pendiente.
  it('con cycle quincenal, uno pagado en la quincena anterior no se arrastra (ya está en `payments`)', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'alquiler', amountPaidCents: 450_000_00 })
    const secondHalf = cycleContaining(biweekly, new Date(2026, 7, 20, 12))
    const s = summarizeFixedExpenses([alquiler], [payment], AGOSTO, HOY_EN_AGOSTO, secondHalf)
    expect(s.pending).toHaveLength(0)
    expect(s.done).toHaveLength(1)
  })

  it('telescopía: las dos quincenas del mes suman exactamente lo que sumaba el mes entero — agarra un doble descuento', () => {
    // `alquiler` (primera quincena) va PAGADO: sin esto, N2 lo arrastraría también a la segunda
    // quincena (a propósito) y la suma de las dos mitades dejaría de coincidir con el mes entero —
    // ese arrastre está cubierto aparte, arriba. Esta telescopía sigue probando lo suyo: que un
    // IMPAGO no se cuenta dos veces entre quincenas que no se solapan.
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 5 })
    const alquilerPago = makeFixedExpensePayment({ fixed_expense_id: 'alquiler', amountPaidCents: 450_000_00 })
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 20 })
    const expenses = [alquiler, internet]
    const payments = [alquilerPago]

    const wholeMonth = summarizeFixedExpenses(expenses, payments, AGOSTO, HOY_EN_AGOSTO)
    const firstHalf = summarizeFixedExpenses(expenses, payments, AGOSTO, HOY_EN_AGOSTO, cycleContaining(biweekly, new Date(2026, 7, 5, 12)))
    const secondHalf = summarizeFixedExpenses(expenses, payments, AGOSTO, HOY_EN_AGOSTO, cycleContaining(biweekly, new Date(2026, 7, 20, 12)))

    expect(firstHalf.pendingTotalCents + secondHalf.pendingTotalCents).toBe(wholeMonth.pendingTotalCents)
    expect(wholeMonth.pendingTotalCents).toBe(35_000_00)
  })

  it('una bolsa sigue contando entera en cualquier quincena del mes (todavía 100% mensual)', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true, due_day: null })
    const firstHalf = cycleContaining(biweekly, new Date(2026, 7, 5, 12))
    const s = summarizeFixedExpenses([nafta], [], AGOSTO, HOY_EN_AGOSTO, firstHalf)
    expect(s.pendingTotalCents).toBe(60_000_00)
  })
})

describe('summarizeFixedExpenses — con months (bloque 5, semanal a caballo de dos meses)', () => {
  const weekly: CycleConfig = { kind: 'weekly', weekStartsOn: 1 }
  // Semana 29 sep – 5 oct — HOY es el 30 de septiembre en estos tests, todavía dentro del mes.
  const HOY_30_SEP = new Date(2026, 8, 30)
  const semana = cycleContaining(weekly, HOY_30_SEP)

  it('sin `months`, un fijo que vence en el segundo mes de la semana no aparece (regresión del comportamiento previo al bloque 5)', () => {
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 2 }) // 2 de octubre
    const s = summarizeFixedExpenses([internet], [], new Date(2026, 8, 1), HOY_30_SEP, semana)
    expect(s.pendingTotalCents).toBe(0)
  })

  it('con `months` = los dos meses de la semana, el fijo del segundo mes aparece y trae su fecha materializada', () => {
    const internet = makeFixedExpense({ id: 'internet', cents: 35_000_00, due_day: 2 })
    const s = summarizeFixedExpenses([internet], [], new Date(2026, 8, 1), HOY_30_SEP, semana, semana.months)
    expect(s.pendingTotalCents).toBe(35_000_00)
    expect(s.pending[0].dueDate).toBe('2026-10-02')
  })

  it('un fijo del primer mes sigue apareciendo igual, con `months` de dos elementos', () => {
    const alquiler = makeFixedExpense({ id: 'alquiler', cents: 450_000_00, due_day: 30 }) // 30 de septiembre
    const s = summarizeFixedExpenses([alquiler], [], new Date(2026, 8, 1), HOY_30_SEP, semana, semana.months)
    expect(s.pendingTotalCents).toBe(450_000_00)
    expect(s.pending[0].dueDate).toBe('2026-09-30')
  })

  it('documenta el riesgo que motiva anclar `period` a HOY en Fijos.tsx: con `period` = primer mes del ciclo a secas, una bolsa mensual cierra de más en cuanto HOY cruza al segundo mes', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const hoy2Oct = new Date(2026, 9, 2) // sigue dentro de la MISMA semana (29 sep–5 oct)
    const primerMesDelCicloASecas = new Date(2026, 8, 1) // lo que daría `cycle.months[0]` sin anclar
    const s = summarizeFixedExpenses([nafta], [], primerMesDelCicloASecas, hoy2Oct, semana, semana.months)
    // Cerrada de más: septiembre ya pasó para `period`, aunque la bolsa sigue vigente en octubre —
    // cae en `done`, no en `pending`. Por eso Fijos.tsx/MisDeudas.tsx usan
    // `isCurrent ? new Date() : cycle.months[0]`, no `cycle.months[0]` siempre.
    expect(s.pending).toHaveLength(0)
    expect(s.done[0].remainingCents).toBe(0)
  })
})

describe('summarizeFixedExpenses — guardado (bloque 3 del plan "BASIC centrado en fijos")', () => {
  it('guardado parcial: no lo saca de pending, pero descuenta de lo que falta guardar', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const saving = makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 20_000_00 })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, [saving])
    expect(s.pending).toHaveLength(1)
    expect(s.pending[0].savedCents).toBe(20_000_00)
    expect(s.pendingTotalCents).toBe(50_000_00) // el guardado no es un pago: sigue debiéndose entero
    expect(s.savedTotalCents).toBe(20_000_00)
    expect(s.missingToSaveCents).toBe(30_000_00)
  })

  it('guardado de más: el total guardado capa al remanente, nunca "adelanta" a otro fijo', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const savings = [
      makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 30_000_00 }),
      makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 40_000_00 }),
    ]
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, savings)
    expect(s.pending[0].savedCents).toBe(70_000_00) // sin capar en el status — la fila puede avisar "de más"
    expect(s.savedTotalCents).toBe(50_000_00) // capado en el total
    expect(s.missingToSaveCents).toBe(0)
  })

  it('un fijo ya pagado no suma a savedTotalCents, aunque tenga guardados', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const payment = makeFixedExpensePayment({ fixed_expense_id: 'f1', amountPaidCents: 50_000_00 })
    const saving = makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 20_000_00 })
    const s = summarizeFixedExpenses([fe], [payment], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, [saving])
    expect(s.done).toHaveLength(1)
    expect(s.savedTotalCents).toBe(0)
    expect(s.missingToSaveCents).toBe(0)
  })

  it('una bolsa ignora los guardados — savedCents siempre 0, no entra en savedTotalCents', () => {
    const nafta = makeFixedExpense({ id: 'nafta', cents: 60_000_00, is_recurring: true })
    const saving = makeFixedExpenseSaving({ fixed_expense_id: 'nafta', amountCents: 20_000_00 })
    const s = summarizeFixedExpenses([nafta], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, [saving])
    expect(s.pending[0].savedCents).toBe(0)
    expect(s.savedTotalCents).toBe(0)
    expect(s.missingToSaveCents).toBe(0)
  })

  it('sin `savings` (default `[]`), el comportamiento es idéntico al de siempre', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO)
    expect(s.savedTotalCents).toBe(0)
    expect(s.missingToSaveCents).toBe(50_000_00)
  })
})

describe('summarizeFixedExpenses — guardado CON movimiento (follow-up del bloque 3)', () => {
  it('guardado con movimiento descuenta de remainingCents/pendingTotalCents — ya salió del saldo real', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const saving = makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 20_000_00, transaction_id: 'tx1' })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, [saving])
    expect(s.pending[0].savedMovementCents).toBe(20_000_00)
    expect(s.pending[0].remainingCents).toBe(30_000_00)
    expect(s.pendingTotalCents).toBe(30_000_00)
  })

  it('guardado con movimiento que cubre todo el fijo: remainingCents 0, ya no pesa en pendingTotalCents', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const saving = makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 50_000_00, transaction_id: 'tx1' })
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, [saving])
    expect(s.pending[0].remainingCents).toBe(0)
    expect(s.pendingTotalCents).toBe(0)
  })

  it('savedTotalCents/missingToSaveCents sólo cuentan el guardado SIN movimiento — el que ya salió del saldo no se muestra dos veces', () => {
    const fe = makeFixedExpense({ id: 'f1', cents: 50_000_00 })
    const savings = [
      makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 20_000_00, transaction_id: 'tx1' }),
      makeFixedExpenseSaving({ fixed_expense_id: 'f1', amountCents: 10_000_00 }),
    ]
    const s = summarizeFixedExpenses([fe], [], AGOSTO, HOY_EN_AGOSTO, undefined, undefined, 1, savings)
    // remainingCents = 50.000 - 20.000 (con movimiento) = 30.000; savedTotalCents sólo cuenta el
    // guardado aparte (10.000), no el que ya está reflejado en remainingCents.
    expect(s.pending[0].remainingCents).toBe(30_000_00)
    expect(s.savedTotalCents).toBe(10_000_00)
    expect(s.missingToSaveCents).toBe(20_000_00)
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
  // Hoy es el 20 de agosto en estos tres casos.
  it('rojo cuando ya venció', () => {
    expect(fixedExpenseUrgency(new Date(2026, 7, 15), HOY_EN_AGOSTO)).toBe('red')
    expect(fixedExpenseUrgency(new Date(2026, 7, 19), HOY_EN_AGOSTO)).toBe('red')
  })

  it('ámbar dentro de los próximos 7 días, hoy incluido', () => {
    expect(fixedExpenseUrgency(new Date(2026, 7, 20), HOY_EN_AGOSTO)).toBe('amber')
    expect(fixedExpenseUrgency(new Date(2026, 7, 26), HOY_EN_AGOSTO)).toBe('amber')
  })

  it('neutro más allá de 7 días', () => {
    expect(fixedExpenseUrgency(new Date(2026, 7, 27), HOY_EN_AGOSTO)).toBe('neutral')
    expect(fixedExpenseUrgency(new Date(2026, 7, 31), HOY_EN_AGOSTO)).toBe('neutral')
  })

  // Bloque 5 del plan: un ciclo semanal puede cruzar el borde del mes — antes (`dueDay -
  // today.getDate()`) esto daba "Venció" con cualquier cosa, porque comparaba días de MESES
  // distintos como si fueran del mismo. Con la fecha materializada, funciona cruzando el mes.
  it('cruzando el borde del mes: un vencimiento de octubre visto desde fines de septiembre no es "vencido"', () => {
    const hoy29Sep = new Date(2026, 8, 29)
    const vence2Oct = new Date(2026, 9, 2)
    expect(fixedExpenseUrgency(vence2Oct, hoy29Sep)).toBe('amber') // faltan 3 días
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

describe('preAccountsPaymentCopy', () => {
  const premium = { canCuentas: true, canEditMovement: true }
  const basic = { canCuentas: false, canEditMovement: false }

  it('Premium, quitar el pago: explica el doble descuento y da los dos consejos', () => {
    const c = preAccountsPaymentCopy({ action: 'unmark', ...premium })
    expect(c.title).toBe('¿Quitar este pago?')
    expect(c.confirmLabel).toBe('Quitar igual')
    expect(c.paragraphs[0]).toContain('antes de que crearas tus cuentas')
    expect(c.paragraphs[0]).toContain('Si lo quitás y lo volvés a pagar')
    expect(c.paragraphs[1]).toContain('editá el movimiento')
    expect(c.paragraphs[1]).toContain('reajustá el saldo')
  })

  it('Premium, eliminar el movimiento: no sugiere editarlo (ya lo está borrando)', () => {
    const c = preAccountsPaymentCopy({ action: 'delete', ...premium })
    expect(c.title).toBe('¿Eliminar este movimiento?')
    expect(c.confirmLabel).toBe('Eliminar igual')
    expect(c.paragraphs[0]).toContain('Si lo eliminás')
    expect(c.paragraphs.join(' ')).not.toContain('editá')
    expect(c.paragraphs[1]).toContain('reajustá el saldo')
  })

  // Regresión del QA en vivo en Básico: el diálogo decía "antes de que crearas tus cuentas" a
  // alguien que no ve Cuentas (las suyas quedan en pausa) — confuso, y sin forma de ir a mirarlas.
  it('Básico, quitar el pago: no nombra cuentas ni saldo de cuenta, y no da consejos', () => {
    const c = preAccountsPaymentCopy({ action: 'unmark', ...basic })
    expect(c.paragraphs).toHaveLength(1)
    expect(c.paragraphs[0]).not.toMatch(/\bcuentas?\b/i)
    expect(c.paragraphs[0]).toContain('se descuenta dos veces')
  })

  it('Básico, eliminar: mismo criterio, con el verbo de la acción', () => {
    const c = preAccountsPaymentCopy({ action: 'delete', ...basic })
    expect(c.paragraphs).toHaveLength(1)
    expect(c.paragraphs[0]).not.toMatch(/\bcuentas?\b/i)
    expect(c.paragraphs[0]).toContain('Si lo eliminás')
  })

  it('Test (edita movimientos y ve Cuentas): igual que Premium', () => {
    expect(preAccountsPaymentCopy({ action: 'unmark', canCuentas: true, canEditMovement: true })).toEqual(
      preAccountsPaymentCopy({ action: 'unmark', ...premium }),
    )
  })
})

// Bloque 1 del QA de Fijos (FI-03, FI-05): antes de este bloque, quitar el pago desde Movimientos o
// eliminar el movimiento de un guardado pasaba al instante, sin avisar.
describe('removeLinkedMovementCopy', () => {
  it('pago, con nombre: nombra el fijo y dice que vuelve a pendiente', () => {
    const c = removeLinkedMovementCopy({ kind: 'payment', description: 'Expensas' })
    expect(c.title).toBe('¿Quitar este pago?')
    expect(c.confirmLabel).toBe('Quitar pago')
    expect(c.paragraphs[0]).toContain('«Expensas»')
    expect(c.paragraphs[0]).toContain('vuelve a quedar pendiente')
  })

  it('pago, sin descripción (o sólo espacios): copy genérico, sin comillas vacías', () => {
    expect(removeLinkedMovementCopy({ kind: 'payment', description: null }).paragraphs[0]).not.toContain('«')
    expect(removeLinkedMovementCopy({ kind: 'payment', description: '   ' }).paragraphs[0]).not.toContain('«')
  })

  it('guardado: título y copy distintos — no habla de "pendiente" sino de la plata apartada', () => {
    const c = removeLinkedMovementCopy({ kind: 'saving', description: 'Guardado · Gimnasio' })
    expect(c.title).toBe('¿Eliminar este guardado?')
    expect(c.confirmLabel).toBe('Eliminar guardado')
    expect(c.paragraphs[0]).toContain('«Guardado · Gimnasio»')
    expect(c.paragraphs[0]).toContain('deja de estar apartada')
    expect(c.paragraphs.join(' ')).not.toContain('pendiente')
  })
})

// Bloque 2 del plan de arreglo (FI-12): antes, guardar o cargar de más decía lo mismo que "exacto"
// ("Con esto lo tenés cubierto."/"Completás el presupuesto"), sin avisar del excedente.
describe('amountAfterCopy', () => {
  it('falta: total por debajo del objetivo', () => {
    expect(amountAfterCopy(30_000_00, 10_000_00, 15_000_00)).toEqual({ kind: 'remaining', cents: 5_000_00 })
  })

  it('exacto: total igual al objetivo', () => {
    expect(amountAfterCopy(30_000_00, 10_000_00, 20_000_00)).toEqual({ kind: 'complete', cents: 0 })
  })

  it('de más: guardado — $10.000 + $25.000 sobre un fijo de $30.000 sobran $5.000', () => {
    expect(amountAfterCopy(30_000_00, 10_000_00, 25_000_00)).toEqual({ kind: 'over', cents: 5_000_00 })
  })

  it('de más: bolsa — quedaban $77.000 y se cargan $90.000, se pasa por $13.000', () => {
    const target = 100_000_00
    const alreadyPaid = target - 77_000_00
    expect(amountAfterCopy(target, alreadyPaid, 90_000_00)).toEqual({ kind: 'over', cents: 13_000_00 })
  })

  it('sin nada previo: el importe solo decide', () => {
    expect(amountAfterCopy(30_000_00, 0, 30_000_00)).toEqual({ kind: 'complete', cents: 0 })
    expect(amountAfterCopy(30_000_00, 0, 35_000_00)).toEqual({ kind: 'over', cents: 5_000_00 })
  })
})
