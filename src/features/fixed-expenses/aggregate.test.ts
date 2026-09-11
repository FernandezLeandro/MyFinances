import { describe, expect, it } from 'vitest'
import { format, parseISO, subDays } from 'date-fns'
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
