import { describe, expect, it } from 'vitest'
import { makeLocation } from '@/test/factories'
import {
  accountFieldMode,
  accountFormSchema,
  accountSelectGroups,
  accountsTotals,
  archiveBlocker,
  deleteImpactText,
  effectiveDefaultAccountId,
  movimientosDeCuentaState,
  nameForKindChange,
  planAdjustment,
} from './aggregate'

describe('nameForKindChange', () => {
  it('nombre vacío + pasar a Efectivo → "Efectivo"', () => {
    expect(nameForKindChange('bank', 'cash', '')).toBe('Efectivo')
    expect(nameForKindChange('wallet', 'cash', '   ')).toBe('Efectivo')
  })

  it('"Efectivo" autocompletado + pasar a Billetera o Banco → se vacía', () => {
    expect(nameForKindChange('cash', 'wallet', 'Efectivo')).toBe('')
    expect(nameForKindChange('cash', 'bank', 'Efectivo')).toBe('')
  })

  it('un nombre propio se respeta al cambiar de tipo', () => {
    expect(nameForKindChange('wallet', 'cash', 'Mercado Pago')).toBe('Mercado Pago')
    expect(nameForKindChange('cash', 'bank', 'Caja fuerte')).toBe('Caja fuerte')
  })

  it('escribir "Efectivo" a mano en una billetera no cuenta como autocompletado', () => {
    expect(nameForKindChange('wallet', 'bank', 'Efectivo')).toBe('Efectivo')
  })

  it('mismo tipo → no toca nada', () => {
    expect(nameForKindChange('cash', 'cash', 'Efectivo')).toBe('Efectivo')
    expect(nameForKindChange('bank', 'bank', '')).toBe('')
  })
})

describe('effectiveDefaultAccountId', () => {
  it('la predeterminada activa', () => {
    const a = makeLocation({ id: 'a', created_at: '2026-01-01T00:00:00Z' })
    const b = makeLocation({ id: 'b', is_default: true, created_at: '2026-02-01T00:00:00Z' })
    expect(effectiveDefaultAccountId([a, b])).toBe('b')
  })

  it('una predeterminada archivada no cuenta: cae en la activa más vieja', () => {
    const archivedDefault = makeLocation({ id: 'x', is_default: true, is_archived: true, created_at: '2026-01-01T00:00:00Z' })
    const newer = makeLocation({ id: 'n', created_at: '2026-03-01T00:00:00Z' })
    const older = makeLocation({ id: 'o', created_at: '2026-02-01T00:00:00Z' })
    expect(effectiveDefaultAccountId([archivedDefault, newer, older])).toBe('o')
  })

  it('sin ninguna activa → vacío', () => {
    expect(effectiveDefaultAccountId([])).toBe('')
    expect(effectiveDefaultAccountId([makeLocation({ is_archived: true })])).toBe('')
  })

  it('misma fecha de creación → desempata por id, igual que el trigger', () => {
    const b = makeLocation({ id: 'b', created_at: '2026-01-01T00:00:00Z' })
    const a = makeLocation({ id: 'a', created_at: '2026-01-01T00:00:00Z' })
    expect(effectiveDefaultAccountId([b, a])).toBe('a')
  })
})

describe('accountsTotals', () => {
  it('las archivadas también suman al total — archivar no saca la plata del saldo', () => {
    const active = makeLocation({ id: 'a' })
    const archived = makeLocation({ id: 'b', is_archived: true })
    const totals = accountsTotals([active, archived], new Map([['a', 100_00], ['b', 50_00]]))
    expect(totals).toEqual({ activeCents: 100_00, archivedCents: 50_00, totalCents: 150_00 })
  })

  it('sin dato derivado cae en la apertura', () => {
    const a = makeLocation({ id: 'a', openingCents: 30_00 })
    expect(accountsTotals([a], new Map()).totalCents).toBe(30_00)
  })

  it('una cuenta en descubierto resta', () => {
    const a = makeLocation({ id: 'a' })
    const b = makeLocation({ id: 'b' })
    expect(accountsTotals([a, b], new Map([['a', 100_00], ['b', -40_00]])).totalCents).toBe(60_00)
  })
})

describe('planAdjustment', () => {
  it('real mayor al actual → INGRESO por la diferencia', () => {
    const plan = planAdjustment({ derivedCents: 100_00, openingCents: 40_00, realCents: 130_00 })
    expect(plan.diffCents).toBe(30_00)
    expect(plan.movement).toEqual({ type: 'income', cents: 30_00 })
    expect(plan.newOpeningCents).toBe(70_00)
  })

  it('real menor al actual → GASTO por la diferencia (el signo no se invierte)', () => {
    const plan = planAdjustment({ derivedCents: 100_00, openingCents: 40_00, realCents: 60_00 })
    expect(plan.diffCents).toBe(-40_00)
    expect(plan.movement).toEqual({ type: 'expense', cents: 40_00 })
    expect(plan.newOpeningCents).toBe(0)
  })

  it('un saldo real negativo (descubierto) es un gasto contra un saldo positivo', () => {
    const plan = planAdjustment({ derivedCents: 10_00, openingCents: 10_00, realCents: -5_00 })
    expect(plan.movement).toEqual({ type: 'expense', cents: 15_00 })
    expect(plan.newOpeningCents).toBe(-5_00)
  })

  it('sin diferencia → no hay movimiento y la apertura no cambia', () => {
    const plan = planAdjustment({ derivedCents: 100_00, openingCents: 40_00, realCents: 100_00 })
    expect(plan.diffCents).toBe(0)
    expect(plan.movement).toBeNull()
    expect(plan.newOpeningCents).toBe(40_00)
  })
})

describe('archiveBlocker', () => {
  it('no deja archivar la última cuenta activa', () => {
    expect(archiveBlocker(1)).toBe('last-active')
    expect(archiveBlocker(0)).toBe('last-active')
  })

  it('con más de una activa se puede', () => {
    expect(archiveBlocker(2)).toBeNull()
  })
})

describe('deleteImpactText', () => {
  it('plurales y singulares', () => {
    expect(deleteImpactText({ transactions: 12, transfers: 2 }, false)).toBe('Se borran 12 movimientos y 2 transferencias.')
    expect(deleteImpactText({ transactions: 1, transfers: 0 }, false)).toBe('Se borra 1 movimiento.')
    expect(deleteImpactText({ transactions: 0, transfers: 1 }, false)).toBe('Se borra 1 transferencia.')
  })

  it('cuenta vacía', () => {
    expect(deleteImpactText({ transactions: 0, transfers: 0 }, false)).toBe('No tiene movimientos ni transferencias.')
  })

  it('la última cuenta avisa que el saldo vuelve a ser la suma de movimientos', () => {
    expect(deleteImpactText({ transactions: 3, transfers: 0 }, true)).toContain('Es tu última cuenta')
  })
})

describe('accountFieldMode', () => {
  const base = { canCuentas: true, activeCount: 2, isEditing: false, txAccountId: null }

  it('plan sin cuentas → oculto', () => {
    expect(accountFieldMode({ ...base, canCuentas: false })).toBe('hidden')
  })

  it('movimiento nuevo con cuentas → obligatoria', () => {
    expect(accountFieldMode(base)).toBe('required')
  })

  it('movimiento nuevo sin ninguna cuenta todavía → oculto (Test antes de crear la primera)', () => {
    expect(accountFieldMode({ ...base, activeCount: 0 })).toBe('hidden')
  })

  it('editar un movimiento viejo sin cuenta → legacy: no se le pide una (contaría la plata dos veces)', () => {
    expect(accountFieldMode({ ...base, isEditing: true })).toBe('legacy')
  })

  it('editar un movimiento que ya tenía cuenta → sigue obligatoria', () => {
    expect(accountFieldMode({ ...base, isEditing: true, txAccountId: 'acc-1' })).toBe('required')
  })
})

describe('accountSelectGroups', () => {
  const cash = makeLocation({ id: 'c', kind: 'cash', name: 'Efectivo' })
  const wallet = makeLocation({ id: 'w', kind: 'wallet', name: 'Mercado Pago' })
  const archivedBank = makeLocation({ id: 'b', kind: 'bank', name: 'ICBC', is_archived: true })

  it('agrupa las activas por tipo, en orden, sin grupos vacíos', () => {
    const groups = accountSelectGroups([wallet, cash, archivedBank], '')
    expect(groups.map((g) => g.kind)).toEqual(['cash', 'wallet'])
  })

  it('incluye la cuenta actual aunque esté archivada, marcada — y ninguna otra archivada', () => {
    const other = makeLocation({ id: 'o', kind: 'bank', name: 'Galicia', is_archived: true })
    const groups = accountSelectGroups([cash, archivedBank, other], 'b')
    const bank = groups.find((g) => g.kind === 'bank')
    expect(bank?.accounts).toEqual([{ id: 'b', name: 'ICBC', archived: true }])
  })
})

describe('movimientosDeCuentaState', () => {
  it('filtra por la cuenta y abre todo el historial hasta hoy', () => {
    expect(movimientosDeCuentaState('acc-1', '2026-09-19')).toEqual({
      accountIds: ['acc-1'],
      period: { preset: 'custom', anchor: '2026-09-19', from: '2000-01-01', to: '2026-09-19' },
    })
  })
})

describe('accountFormSchema', () => {
  const ok = { name: 'Mercado Pago', kind: 'wallet' as const, opening: '1.500,50' }

  it('acepta un alta válida', () => {
    expect(accountFormSchema.safeParse(ok).success).toBe(true)
  })

  it('el nombre no puede estar vacío ni ser sólo espacios', () => {
    expect(accountFormSchema.safeParse({ ...ok, name: '   ' }).success).toBe(false)
  })

  it('el nombre tiene tope de 60 caracteres', () => {
    expect(accountFormSchema.safeParse({ ...ok, name: 'a'.repeat(61) }).success).toBe(false)
  })

  it('acepta un monto negativo (banco en descubierto) y cero', () => {
    expect(accountFormSchema.safeParse({ ...ok, opening: '-500' }).success).toBe(true)
    expect(accountFormSchema.safeParse({ ...ok, opening: '0' }).success).toBe(true)
  })

  it('rechaza un monto que no es número o que no entra en numeric(12,2)', () => {
    expect(accountFormSchema.safeParse({ ...ok, opening: 'abc' }).success).toBe(false)
    expect(accountFormSchema.safeParse({ ...ok, opening: '' }).success).toBe(false)
    expect(accountFormSchema.safeParse({ ...ok, opening: '99999999999' }).success).toBe(false)
  })

  it('rechaza un tipo desconocido', () => {
    expect(accountFormSchema.safeParse({ ...ok, kind: 'crypto' }).success).toBe(false)
  })
})
