import { describe, expect, it } from 'vitest'
import { formatMoney } from '@/lib/money'
import { makeLocation } from '@/test/factories'
import {
  accountColor,
  accountComposition,
  accountFieldMode,
  accountFormSchema,
  accountMenuEntries,
  accountNameError,
  accountSelectGroups,
  accountsForGrid,
  accountsTotals,
  adjustFormState,
  adjustResultText,
  archiveBlocker,
  archiveResultText,
  createAccountResultText,
  defaultFundingAccountId,
  describeAccountDelete,
  effectiveDefaultAccountId,
  firstAccountRestNote,
  firstAccountSplit,
  formatShare,
  fundingBalanceNote,
  fundingError,
  maxFromAccountCents,
  overdrawError,
  movimientosDeCuentaState,
  nameForKindChange,
  newAccountEffect,
  totalFigureSize,
  planAdjustment,
  reactivateResultText,
  stopUsingAccountsSummary,
  UNASSIGNED_ACCOUNT_NAME,
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
  it('una archivada NO suma al total — archivar saca su plata del saldo', () => {
    // Cambio de doctrina (migración 20260920010001): antes el total incluía las archivadas. Tiene que
    // coincidir con `rpc_current_balance`, que ahora sólo suma las activas.
    const active = makeLocation({ id: 'a' })
    const archived = makeLocation({ id: 'b', is_archived: true })
    const totals = accountsTotals([active, archived], new Map([['a', 100_00], ['b', 50_00]]))
    expect(totals).toEqual({ activeCents: 100_00, archivedCents: 50_00, totalCents: 100_00 })
  })

  it('con todas archivadas el total es 0, aunque tengan plata', () => {
    const archived = makeLocation({ id: 'b', is_archived: true })
    expect(accountsTotals([archived], new Map([['b', 50_00]])).totalCents).toBe(0)
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

describe('describeAccountDelete', () => {
  function impact(overrides: Partial<Parameters<typeof describeAccountDelete>[0]> = {}) {
    return { movimientos: 0, transferencias: 0, balanceCents: 0, isArchived: false, ...overrides }
  }

  it('plurales y singulares', () => {
    expect(describeAccountDelete(impact({ movimientos: 12, transferencias: 2 })).summary).toContain('Se borran 12 movimientos y 2 transferencias.')
    expect(describeAccountDelete(impact({ movimientos: 1 })).summary).toContain('Se borra 1 movimiento.')
    expect(describeAccountDelete(impact({ transferencias: 1 })).summary).toContain('Se borra 1 transferencia.')
  })

  it('cuenta vacía', () => {
    expect(describeAccountDelete(impact()).summary).toContain('No tiene movimientos ni transferencias.')
  })

  // Regresión de N1 (re-test de QA): el preview viejo (`rpc_account_delete_preview`) calculaba mal
  // el efecto en otra cuenta — con el pliegue de `20260923020001_eliminar_cuenta_solo_lo_suyo.sql`
  // ya no hay otro efecto que calcular, y el texto lo dice siempre, tenga o no movimientos.
  it('siempre dice que las demás cuentas no cambian — es la garantía del pliegue, no un cálculo', () => {
    expect(describeAccountDelete(impact()).summary).toContain('Las demás cuentas no cambian.')
    expect(describeAccountDelete(impact({ movimientos: 5, transferencias: 3, balanceCents: 60000 })).summary).toContain(
      'Las demás cuentas no cambian.',
    )
  })

  it('sin movimientos ni saldo propio: "Eliminar" a secas, sin recomendar archivar', () => {
    const d = describeAccountDelete(impact())
    expect(d.balanceChangeText).toBeNull()
    expect(d.recommendArchive).toBe(false)
    expect(d.deleteLabel).toBe('Eliminar')
  })

  it('con saldo propio activo: baja el saldo total y recomienda archivar', () => {
    const d = describeAccountDelete(impact({ balanceCents: 60000 }))
    expect(d.balanceChangeText).toBe(`Tu saldo baja ${formatMoney(60000)}.`)
    expect(d.recommendArchive).toBe(true)
    expect(d.deleteLabel).toBe('Eliminar igual')
  })

  it('con saldo propio negativo (en descubierto): eliminarla SUBE el saldo total', () => {
    const d = describeAccountDelete(impact({ balanceCents: -5000 }))
    expect(d.balanceChangeText).toBe(`Tu saldo sube ${formatMoney(5000)}.`)
    expect(d.recommendArchive).toBe(true)
  })

  it('sólo movimientos (saldo en $0): recomienda archivar por el historial, aunque el total no se mueva', () => {
    const d = describeAccountDelete(impact({ movimientos: 4 }))
    expect(d.balanceChangeText).toBeNull()
    expect(d.recommendArchive).toBe(true)
    expect(d.deleteLabel).toBe('Eliminar igual')
  })

  it('una archivada con saldo propio no mueve el total (no cuenta para `rpc_current_balance`)', () => {
    const d = describeAccountDelete(impact({ balanceCents: 60000, isArchived: true }))
    expect(d.balanceChangeText).toBeNull()
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

describe('adjustFormState', () => {
  it('un importe que difiere del saldo actual se puede mandar', () => {
    const state = adjustFormState('12.400,00', 9_600_00, 0)
    expect(state.canSubmit).toBe(true)
    expect(state.error).toBeNull()
    expect(state.plan?.diffCents).toBe(12_400_00 - 9_600_00)
  })

  it('el mismo saldo que el actual apaga el botón SIN error — el campo arranca precargado así', () => {
    const state = adjustFormState('9.600,00', 9_600_00, 0)
    expect(state.canSubmit).toBe(false)
    expect(state.error).toBeNull()
  })

  it('vacío o sin dígitos → error de importe, y sin plan que mostrar', () => {
    for (const input of ['', '   ', '-', 'abc']) {
      const state = adjustFormState(input, 100_00, 0)
      expect(state.canSubmit).toBe(false)
      expect(state.error).toBe('Ingresá un importe válido para poder reajustar.')
      expect(state.plan).toBeNull()
    }
  })

  it('cero y negativo son válidos: quien gastó todo o está en descubierto tiene que poder reajustar', () => {
    // Regresión de diseño: el mock pedía "importe > 0", pero un saldo real de $ 0 (o en descubierto)
    // es un dato legítimo y el RPC lo acepta.
    expect(adjustFormState('0', 100_00, 0).canSubmit).toBe(true)
    expect(adjustFormState('-4.500,00', 100_00, 0).canSubmit).toBe(true)
  })

  // Regresión de M1 (QA): con 11 cifras el diálogo mostraba a la vez "Ingresá un importe válido…" Y
  // el efecto calculado con ese mismo importe fuera de rango ("…ingreso de $100.000.000.499,00").
  // El plan tiene que ser `null` exactamente cuando hay error, para que no haya nada que mostrar.
  it('un importe fuera del tope de la base es un error, y el plan viene null — nunca los dos juntos', () => {
    const state = adjustFormState('99.999.999.999,00', 100_00, 0)
    expect(state.error).not.toBeNull()
    expect(state.plan).toBeNull()
  })
})

describe('adjustResultText', () => {
  it('con movimiento dice cuánto fue el ajuste, siempre en positivo', () => {
    expect(adjustResultText({ accountName: 'Efectivo', realCents: 12_400_00, diffCents: 2_800_00, mode: 'movement' })).toEqual({
      title: 'Saldo reajustado',
      detail: `Efectivo queda en ${formatMoney(12_400_00)} · ajuste de ${formatMoney(2_800_00)}`,
    })
    // Un ajuste a la baja no muestra el signo menos: "ajuste de −$ 500" sonaría a un gasto anotado.
    expect(adjustResultText({ accountName: 'Efectivo', realCents: 9_100_00, diffCents: -500_00, mode: 'movement' }).detail).toContain(
      `ajuste de ${formatMoney(500_00)}`,
    )
  })

  it('corrigiendo el saldo inicial no habla de un ajuste: no crea movimiento', () => {
    const { detail } = adjustResultText({ accountName: 'ICBC', realCents: 100_00, diffCents: 30_00, mode: 'opening' })
    expect(detail).toContain('saldo inicial corregido')
    expect(detail).not.toContain('ajuste de')
  })

  it('una cuenta sin nombre no deja un hueco', () => {
    expect(adjustResultText({ accountName: '', realCents: 100_00, diffCents: 1, mode: 'movement' }).detail).toMatch(/^La cuenta queda en/)
  })
})

describe('accountsForGrid', () => {
  it('la predeterminada va primera y el resto conserva su orden', () => {
    const a = makeLocation({ id: 'a', created_at: '2026-01-01T00:00:00Z' })
    const b = makeLocation({ id: 'b', created_at: '2026-02-01T00:00:00Z' })
    const c = makeLocation({ id: 'c', is_default: true, created_at: '2026-03-01T00:00:00Z' })
    const grid = accountsForGrid([a, b, c])
    expect(grid.accounts.map((l) => l.id)).toEqual(['c', 'a', 'b'])
    expect(grid.defaultId).toBe('c')
  })

  it('sin predeterminada explícita, la activa más vieja hace de tal — igual que en los formularios', () => {
    const newer = makeLocation({ id: 'n', created_at: '2026-03-01T00:00:00Z' })
    const older = makeLocation({ id: 'o', created_at: '2026-01-01T00:00:00Z' })
    const grid = accountsForGrid([newer, older])
    expect(grid.accounts.map((l) => l.id)).toEqual(['o', 'n'])
    expect(grid.defaultId).toBe('o')
  })

  it('las archivadas quedan aparte, y una predeterminada archivada no cuenta', () => {
    const archivedDefault = makeLocation({ id: 'x', is_default: true, is_archived: true })
    const active = makeLocation({ id: 'y' })
    const grid = accountsForGrid([archivedDefault, active])
    expect(grid.accounts.map((l) => l.id)).toEqual(['y'])
    expect(grid.archived.map((l) => l.id)).toEqual(['x'])
    expect(grid.defaultId).toBe('y')
  })

  it('sin cuentas → todo vacío', () => {
    expect(accountsForGrid([])).toEqual({ accounts: [], archived: [], defaultId: '' })
  })
})

describe('accountColor', () => {
  it('nunca usa cat-2, el coral de "gasto"', () => {
    for (let i = 0; i < 20; i++) expect(accountColor(i)).not.toBe('var(--c-cat-2)')
  })

  it('da la vuelta pasadas las cinco cuentas en vez de romperse', () => {
    expect(accountColor(5)).toBe(accountColor(0))
    expect(accountColor(6)).toBe(accountColor(1))
  })
})

describe('formatShare', () => {
  it('redondea al entero', () => {
    expect(formatShare(74.5)).toBe('75%')
    expect(formatShare(23.7)).toBe('24%')
    expect(formatShare(1.8)).toBe('2%')
  })

  it('lo que existe pero redondearía a cero dice "<1%", no "0%"', () => {
    expect(formatShare(0.3)).toBe('<1%')
    expect(formatShare(0)).toBe('0%')
    expect(formatShare(100)).toBe('100%')
  })
})

describe('accountComposition', () => {
  const a = makeLocation({ id: 'a', name: 'ICBC', created_at: '2026-01-01T00:00:00Z', is_default: true })
  const b = makeLocation({ id: 'b', name: 'Mercado Pago', created_at: '2026-02-01T00:00:00Z' })
  const c = makeLocation({ id: 'c', name: 'Efectivo', created_at: '2026-03-01T00:00:00Z' })

  it('reparte el total por saldo y suma 100', () => {
    const slices = accountComposition([a, b, c], new Map([['a', 75_00], ['b', 24_00], ['c', 1_00]]))
    expect(slices.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(slices[0].pct).toBeCloseTo(75, 5)
    expect(slices.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100, 5)
  })

  it('un saldo negativo no aporta porción, y no achica a las demás', () => {
    // Una cuenta en descubierto restaría del total, pero una barra no puede tener ancho negativo:
    // las porciones se calculan sobre lo positivo, así siguen sumando 100.
    const slices = accountComposition([a, b], new Map([['a', 100_00], ['b', -40_00]]))
    expect(slices.map((s) => s.id)).toEqual(['a'])
    expect(slices[0].pct).toBeCloseTo(100, 5)
  })

  it('el color de una cuenta no cambia cuando otra queda en cero', () => {
    const conTodas = accountComposition([a, b, c], new Map([['a', 10_00], ['b', 10_00], ['c', 10_00]]))
    const sinLaDelMedio = accountComposition([a, b, c], new Map([['a', 10_00], ['b', 0], ['c', 10_00]]))
    expect(sinLaDelMedio.find((s) => s.id === 'c')?.color).toBe(conTodas.find((s) => s.id === 'c')?.color)
  })

  it('todo en cero, o sin cuentas → sin porciones (nada que dividir por cero)', () => {
    expect(accountComposition([a, b], new Map([['a', 0], ['b', 0]]))).toEqual([])
    expect(accountComposition([], new Map())).toEqual([])
    expect(accountComposition([a], new Map([['a', -5_00]]))).toEqual([])
  })

  it('las archivadas no entran: el total no las cuenta, así que el 100% de la barra tampoco', () => {
    const archived = makeLocation({ id: 'z', name: 'Cuenta sueldo', is_archived: true })
    const slices = accountComposition([a, archived], new Map([['a', 60_00], ['z', 40_00]]))
    expect(slices.map((s) => s.id)).toEqual(['a'])
    expect(slices[0].pct).toBeCloseTo(100, 5)
  })

  it('sin dato derivado cae en la apertura, como accountsTotals', () => {
    const conApertura = makeLocation({ id: 'q', openingCents: 50_00 })
    expect(accountComposition([conApertura], new Map())[0].pct).toBeCloseTo(100, 5)
  })
})

describe('accountMenuEntries', () => {
  const ids = (entries: ReturnType<typeof accountMenuEntries>) => entries.map((e) => (e.kind === 'divider' ? '—' : e.id))

  it('popover: sin Reajustar (ya es el botón de la tarjeta), con el orden del diseño', () => {
    expect(ids(accountMenuEntries({ surface: 'popover', isDefault: false, activeCount: 3 }))).toEqual([
      'edit', 'setDefault', 'transfer', 'viewMovements', '—', 'archive', 'delete',
    ])
  })

  it('hoja de mobile: Reajustar va primero — ahí es el único menú', () => {
    expect(ids(accountMenuEntries({ surface: 'sheet', isDefault: false, activeCount: 3 }))[0]).toBe('adjust')
  })

  it('la predeterminada no ofrece hacerse predeterminada', () => {
    expect(ids(accountMenuEntries({ surface: 'popover', isDefault: true, activeCount: 3 }))).not.toContain('setDefault')
  })

  // Regresión de N5/C2 (QA): sobre la última cuenta activa ni Archivar NI Eliminar se ofrecen — los
  // dos dejarían al usuario sin ninguna cuenta activa. La única salida es el interruptor «Cuentas»
  // de Ajustes (`StopUsingAccountsDialog`), que no es un ítem de este menú.
  it('con una sola cuenta activa no hay Transferir, ni Archivar, ni Eliminar', () => {
    const entries = ids(accountMenuEntries({ surface: 'popover', isDefault: true, activeCount: 1 }))
    expect(entries).not.toContain('transfer')
    expect(entries).not.toContain('archive')
    expect(entries).not.toContain('delete')
    expect(entries).not.toContain('—')
  })

  it('Eliminar es siempre lo último y destructivo; Archivar es la opción quieta', () => {
    const entries = accountMenuEntries({ surface: 'sheet', isDefault: false, activeCount: 2 })
    expect(entries[entries.length - 1]).toMatchObject({ kind: 'action', id: 'delete', tone: 'destructive' })
    expect(entries.find((e) => e.kind === 'action' && e.id === 'archive')).toMatchObject({ tone: 'quiet' })
  })
})

describe('archiveResultText', () => {
  it('con saldo avisa cuánto BAJA el total — sin diálogo, nadie más se entera', () => {
    const { title, detail } = archiveResultText('Cuenta sueldo', 40_000_00)
    expect(title).toBe('Cuenta archivada')
    expect(detail).toContain('deja de sumar a tu saldo')
    expect(detail).toContain(`baja ${formatMoney(40_000_00)}`)
  })

  it('en cero el total no se mueve, así que no habla de plata', () => {
    const { detail } = archiveResultText('Cuenta sueldo', 0)
    expect(detail).not.toContain('baja')
    expect(detail).not.toContain('sube')
  })

  it('un saldo negativo (descubierto) SUBE el total al archivarla, y el monto va sin signo', () => {
    // Una cuenta en descubierto resta del total: sacarla lo sube. "baja −$ 5" sería un sinsentido.
    const { detail } = archiveResultText('ICBC', -5_00)
    expect(detail).toContain(`sube ${formatMoney(5_00)}`)
    expect(detail).not.toContain('−')
  })
})

describe('reactivateResultText', () => {
  it('con saldo avisa cuánto SUBE el total al volver a sumar', () => {
    const { title, detail } = reactivateResultText('Cuenta sueldo', 40_000_00)
    expect(title).toBe('Cuenta reactivada')
    expect(detail).toContain('vuelve a sumar a tu saldo')
    expect(detail).toContain(`sube ${formatMoney(40_000_00)}`)
  })

  it('un saldo negativo BAJA el total al reactivarla', () => {
    expect(reactivateResultText('ICBC', -5_00).detail).toContain(`baja ${formatMoney(5_00)}`)
  })

  it('en cero sólo dice que vuelve a ofrecerse', () => {
    const { detail } = reactivateResultText('Cuenta sueldo', 0)
    expect(detail).toContain('vuelve a ofrecerse')
    expect(detail).not.toContain('sube')
  })
})

describe('totalFigureSize', () => {
  it('hasta 7 dígitos enteros entra en el tamaño grande', () => {
    expect(totalFigureSize(543_895_41)).toBe('total') // 6 dígitos — el del diseño
    expect(totalFigureSize(1_234_567_89)).toBe('total') // 7 dígitos
  })

  it('8 dígitos o más baja a la cifra que se achica sola — no se desborda de la tarjeta', () => {
    // Los importes reales de quien usa la app tienen 7+ cifras: el `total` fijo de 46px se salía
    // de la columna de 340px.
    expect(totalFigureSize(12_345_678_90)).toBe('figure')
    expect(totalFigureSize(999_999_999_99)).toBe('figure')
  })

  it('el signo menos cuenta como un dígito más', () => {
    expect(totalFigureSize(-1_234_567_89)).toBe('figure')
    expect(totalFigureSize(-123_456_78)).toBe('total')
  })

  it('cero y centavos sueltos', () => {
    expect(totalFigureSize(0)).toBe('total')
    expect(totalFigureSize(5)).toBe('total')
  })
})

describe('firstAccountSplit', () => {
  it('declarar menos que el saldo deja un resto para guardar aparte', () => {
    expect(firstAccountSplit(200_000_00, 998_800_00)).toEqual({ restCents: 798_800_00, kind: 'rest' })
  })

  it('declarar todo el saldo no deja resto', () => {
    expect(firstAccountSplit(998_800_00, 998_800_00)).toEqual({ restCents: 0, kind: 'exact' })
  })

  it('declarar de más NO es un resto negativo: es plata nueva, sin nada que guardar aparte', () => {
    expect(firstAccountSplit(1_000_000_00, 998_800_00)).toEqual({ restCents: 0, kind: 'over' })
  })

  it('con saldo en cero o negativo no hay nada que repartir', () => {
    expect(firstAccountSplit(50_000_00, 0)).toEqual({ restCents: 0, kind: 'over' })
    expect(firstAccountSplit(0, -30_000_00)).toEqual({ restCents: 0, kind: 'over' })
    expect(firstAccountSplit(0, 0)).toEqual({ restCents: 0, kind: 'exact' })
  })

  it('una apertura negativa (banco en descubierto) hace crecer el resto', () => {
    expect(firstAccountSplit(-10_000_00, 100_000_00)).toEqual({ restCents: 110_000_00, kind: 'rest' })
  })
})

describe('newAccountEffect', () => {
  const base = { accountName: 'Efectivo', balanceCents: 998_800_00 }

  it('primera cuenta con resto, dejándolo en «Sin repartir»: el saldo no se mueve', () => {
    const effect = newAccountEffect({ ...base, hasAccounts: false, source: 'hold', openingCents: 200_000_00 })
    expect(effect.totalAfterCents).toBe(998_800_00)
    expect(effect.note).toContain(UNASSIGNED_ACCOUNT_NAME)
    expect(effect.note).toContain(formatMoney(998_800_00))
  })

  it('primera cuenta con resto, sin declararlo: el saldo baja a lo declarado y el aviso lo dice', () => {
    const effect = newAccountEffect({ ...base, hasAccounts: false, source: 'drop', openingCents: 200_000_00 })
    expect(effect.totalAfterCents).toBe(200_000_00)
    expect(effect.note).toBe(`Tu saldo pasa de ${formatMoney(998_800_00)} a ${formatMoney(200_000_00)}. Lo que no declares deja de contar.`)
  })

  it('primera cuenta que declara todo: el saldo no cambia', () => {
    const effect = newAccountEffect({ ...base, hasAccounts: false, source: 'hold', openingCents: 998_800_00 })
    expect(effect.totalAfterCents).toBe(998_800_00)
    expect(effect.note).toContain('no cambia')
  })

  it('primera cuenta que declara de más: el saldo sube, y "hold" no aplica sin resto', () => {
    const effect = newAccountEffect({ ...base, hasAccounts: false, source: 'hold', openingCents: 1_000_000_00 })
    expect(effect.totalAfterCents).toBe(1_000_000_00)
    expect(effect.note).toBe(`Tu saldo sube de ${formatMoney(998_800_00)} a ${formatMoney(1_000_000_00)}.`)
  })

  it('ya hay cuentas y sale de otra: el total no cambia y nombra las dos', () => {
    const effect = newAccountEffect({
      ...base,
      accountName: 'Banco',
      hasAccounts: true,
      source: 'from',
      openingCents: 300_000_00,
      fromName: UNASSIGNED_ACCOUNT_NAME,
    })
    expect(effect.totalAfterCents).toBe(998_800_00)
    expect(effect.note).toBe(`Tu saldo no cambia: la plata se mueve de ${UNASSIGNED_ACCOUNT_NAME} a Banco.`)
  })

  it('ya hay cuentas y es plata nueva: el total sube por la apertura', () => {
    const effect = newAccountEffect({ ...base, hasAccounts: true, source: 'new', openingCents: 1_200_00 })
    expect(effect.totalAfterCents).toBe(998_800_00 + 1_200_00)
    expect(effect.note).toBe(`Tu saldo sube de ${formatMoney(998_800_00)} a ${formatMoney(1_000_000_00)}.`)
  })

  it('plata nueva negativa (descubierto) baja el total; en cero no lo mueve', () => {
    const negative = newAccountEffect({ ...base, hasAccounts: true, source: 'new', openingCents: -5_000_00 })
    expect(negative.totalAfterCents).toBe(993_800_00)
    expect(negative.note).toContain('baja')
    const zero = newAccountEffect({ ...base, hasAccounts: true, source: 'new', openingCents: 0 })
    expect(zero).toEqual({ totalAfterCents: 998_800_00, note: 'Tu saldo no cambia.' })
  })
})

describe('defaultFundingAccountId', () => {
  it('elige la cuenta activa con más saldo', () => {
    const banco = makeLocation({ id: 'banco', name: 'Banco', kind: 'bank' })
    const sinRepartir = makeLocation({ id: 'sr', name: UNASSIGNED_ACCOUNT_NAME })
    const derived = new Map([
      ['banco', 10_000_00],
      ['sr', 798_800_00],
    ])
    expect(defaultFundingAccountId([banco, sinRepartir], derived)).toBe('sr')
  })

  it('ante un empate gana la predeterminada, esté donde esté en la lista', () => {
    const a = makeLocation({ id: 'a' })
    const b = makeLocation({ id: 'b', is_default: true })
    expect(defaultFundingAccountId([a, b], new Map())).toBe('b')
  })

  it('sin dato derivado cae en la apertura', () => {
    const a = makeLocation({ id: 'a', openingCents: 5_000_00 })
    const b = makeLocation({ id: 'b', openingCents: 9_000_00 })
    expect(defaultFundingAccountId([a, b], new Map())).toBe('b')
  })

  it('una archivada nunca se ofrece, aunque tenga más plata', () => {
    const activa = makeLocation({ id: 'act' })
    const archivada = makeLocation({ id: 'arch', is_archived: true })
    expect(defaultFundingAccountId([activa, archivada], new Map([['arch', 1_000_000_00]]))).toBe('act')
  })

  it('sin cuentas activas devuelve vacío', () => {
    expect(defaultFundingAccountId([], new Map())).toBe('')
    expect(defaultFundingAccountId([makeLocation({ is_archived: true })], new Map())).toBe('')
  })

  it('un saldo negativo también puede ser el único candidato', () => {
    const a = makeLocation({ id: 'a' })
    expect(defaultFundingAccountId([a], new Map([['a', -20_00]]))).toBe('a')
  })
})

describe('fundingError', () => {
  const from = { source: 'from' as const, fromAccountId: 'a', openingCents: 50_000_00, fromBalanceCents: 100_000_00, fromName: 'Banco' }

  it('sólo valida cuando la apertura sale de otra cuenta', () => {
    expect(fundingError({ ...from, source: 'new', fromAccountId: '', openingCents: 0 })).toBeNull()
    expect(fundingError({ ...from, source: 'hold', fromAccountId: '', openingCents: 0 })).toBeNull()
    expect(fundingError({ ...from, source: 'drop', fromAccountId: '', openingCents: 999_999_00 })).toBeNull()
  })

  it('falta elegir de qué cuenta sale', () => {
    expect(fundingError({ ...from, fromAccountId: '' })).toBe('Elegí de qué cuenta sale.')
  })

  it('importe cero o negativo no puede salir de otra cuenta (la transferencia exige > 0)', () => {
    expect(fundingError({ ...from, openingCents: 0 })).toContain('mayor a cero')
    expect(fundingError({ ...from, openingCents: -100 })).toContain('mayor a cero')
  })

  it('con un importe que no se entiende no lo marca: eso lo dice el propio campo', () => {
    expect(fundingError({ ...from, openingCents: null })).toBeNull()
  })

  it('con origen e importe que entran no hay error', () => {
    expect(fundingError(from)).toBeNull()
  })

  it('sacar justo todo lo que tiene entra: la cuenta queda en cero', () => {
    expect(fundingError({ ...from, openingCents: 100_000_00 })).toBeNull()
  })

  it('no se puede sacar más de lo que tiene: el mensaje dice cuánto tiene', () => {
    // El importe se mueve de una cuenta a otra: si la de origen no lo tiene, esa plata no existe.
    const error = fundingError({ ...from, openingCents: 100_000_01 })
    expect(error).toBe(`Banco tiene ${formatMoney(100_000_00)}: no podés sacar más que eso.`)
  })

  it('una cuenta sin saldo o en descubierto no puede prestar nada', () => {
    expect(fundingError({ ...from, fromBalanceCents: 0, openingCents: 1 })).toBe('Banco no tiene saldo para sacar.')
    expect(fundingError({ ...from, fromBalanceCents: -20_00, openingCents: 1_00 })).toBe('Banco no tiene saldo para sacar.')
  })

  it('sin saldo conocido todavía (cargando) no bloquea: lo valida la base', () => {
    expect(fundingError({ ...from, fromBalanceCents: undefined, openingCents: 999_999_00 })).toBeNull()
  })

  it('sin nombre no queda un hueco', () => {
    expect(fundingError({ ...from, fromName: '', openingCents: 200_000_00 })).toContain('Esa cuenta tiene')
  })
})

describe('overdrawError', () => {
  it('un importe que entra no es error, ni siquiera si vacía la cuenta', () => {
    expect(overdrawError('Banco', 100_000_00, 50_000_00)).toBeNull()
    expect(overdrawError('Banco', 100_000_00, 100_000_00)).toBeNull()
  })

  it('pasarse por un centavo ya es error, y dice cuánto tiene', () => {
    expect(overdrawError('Banco', 100_000_00, 100_000_01)).toBe(`Banco tiene ${formatMoney(100_000_00)}: no podés sacar más que eso.`)
  })

  it('una cuenta en cero o en descubierto no tiene nada para sacar', () => {
    expect(overdrawError('Banco', 0, 1)).toBe('Banco no tiene saldo para sacar.')
    expect(overdrawError('Banco', -20_00, 1)).toBe('Banco no tiene saldo para sacar.')
  })

  it('sin nombre no queda un hueco', () => {
    expect(overdrawError('', 10_00, 20_00)).toBe(`Esa cuenta tiene ${formatMoney(10_00)}: no podés sacar más que eso.`)
  })
})

describe('maxFromAccountCents', () => {
  it('es todo el saldo de la cuenta de origen', () => {
    expect(maxFromAccountCents(798_800_00)).toBe(798_800_00)
    expect(maxFromAccountCents(1)).toBe(1)
  })

  it('sin nada que sacar no hay máximo: el botón no se ofrece', () => {
    expect(maxFromAccountCents(0)).toBeNull()
    expect(maxFromAccountCents(-5_00)).toBeNull()
    expect(maxFromAccountCents(undefined)).toBeNull()
  })

  it('lo que devuelve siempre pasa la validación de sobregiro', () => {
    const max = maxFromAccountCents(123_456_78)!
    expect(overdrawError('Banco', 123_456_78, max)).toBeNull()
  })
})

describe('fundingBalanceNote', () => {
  it('sin importe válido sólo dice cuánto tiene la cuenta', () => {
    expect(fundingBalanceNote('Sin repartir', 798_800_00, null)).toBe(`Sin repartir tiene ${formatMoney(798_800_00)}.`)
    expect(fundingBalanceNote('Sin repartir', 798_800_00, 0)).toBe(`Sin repartir tiene ${formatMoney(798_800_00)}.`)
  })

  it('con importe dice cuánto le queda', () => {
    expect(fundingBalanceNote('Sin repartir', 798_800_00, 300_000_00)).toBe(
      `Sin repartir tiene ${formatMoney(798_800_00)} y le quedan ${formatMoney(498_800_00)}.`,
    )
  })

  it('vaciar la cuenta deja cero', () => {
    expect(fundingBalanceNote('Efectivo', 50_000_00, 50_000_00)).toBe(
      `Efectivo tiene ${formatMoney(50_000_00)} y le quedan ${formatMoney(0)}.`,
    )
  })

  it('un importe que no entra no promete un saldo negativo: de eso se ocupa fundingError', () => {
    expect(fundingBalanceNote('Efectivo', 50_000_00, 80_000_00)).toBe(`Efectivo tiene ${formatMoney(50_000_00)}.`)
    expect(fundingBalanceNote('Banco', -10_000_00, 5_000_00)).toBe(`Banco tiene ${formatMoney(-10_000_00)}.`)
  })

  it('sin nombre no queda un hueco', () => {
    expect(fundingBalanceNote('', 1_000_00, null)).toBe(`Esa cuenta tiene ${formatMoney(1_000_00)}.`)
  })
})

describe('createAccountResultText', () => {
  it('con resto guardado avisa cuánto quedó en «Sin repartir» y que el saldo no cambia', () => {
    const { title, detail } = createAccountResultText({
      name: 'Efectivo',
      openingCents: 200_000_00,
      heldRestCents: 798_800_00,
      fromName: null,
    })
    expect(title).toBe('Cuenta agregada')
    expect(detail).toContain(formatMoney(798_800_00))
    expect(detail).toContain(UNASSIGNED_ACCOUNT_NAME)
    expect(detail).toContain('no cambia')
  })

  it('con origen dice de dónde salió la apertura', () => {
    const { detail } = createAccountResultText({
      name: 'Banco',
      openingCents: 300_000_00,
      heldRestCents: 0,
      fromName: UNASSIGNED_ACCOUNT_NAME,
    })
    expect(detail).toBe(`Banco · ${formatMoney(300_000_00)} desde ${UNASSIGNED_ACCOUNT_NAME}`)
  })

  it('en el caso simple sólo nombra la cuenta', () => {
    expect(createAccountResultText({ name: 'Efectivo', openingCents: 0, heldRestCents: 0, fromName: null }).detail).toBe('Efectivo')
  })
})

// Regresión de N6 (QA): se podían tener dos cuentas con el mismo nombre, indistinguibles en
// cualquier selector ("Sin repartir" / "Sin repartir"). Mismo criterio que el índice único de la
// base (`balance_locations_user_name_idx`): sin distinguir mayúsculas ni espacios, y sólo activas.
describe('accountNameError', () => {
  const efectivo = makeLocation({ id: 'e', name: 'Efectivo' })
  const archivedEfectivo = makeLocation({ id: 'e2', name: 'Efectivo', is_archived: true })

  it('nombre nuevo: sin error', () => {
    expect(accountNameError({ name: 'Mercado Pago', locations: [efectivo] })).toBeNull()
  })

  it('mismo nombre exacto en otra activa: error', () => {
    expect(accountNameError({ name: 'Efectivo', locations: [efectivo] })).not.toBeNull()
  })

  it('sin distinguir mayúsculas ni espacios al principio/final', () => {
    expect(accountNameError({ name: '  EFECTIVO  ', locations: [efectivo] })).not.toBeNull()
  })

  it('una archivada con el mismo nombre no choca — no se ofrece en ningún selector', () => {
    expect(accountNameError({ name: 'Efectivo', locations: [archivedEfectivo] })).toBeNull()
  })

  it('editar sin cambiar el nombre no choca consigo misma (`excludeId`)', () => {
    expect(accountNameError({ name: 'Efectivo', locations: [efectivo], excludeId: 'e' })).toBeNull()
  })

  it('vacío no es un error acá — lo bloquea `accountFormSchema`', () => {
    expect(accountNameError({ name: '   ', locations: [efectivo] })).toBeNull()
  })
})

// Regresión de M2 (QA): con apertura negativa, "los otros $X" de `firstAccountSplit` da un número
// mayor a TODO el saldo que el usuario tenía, y alarma aunque cierre matemáticamente.
describe('firstAccountRestNote', () => {
  it('con apertura negativa, aclara por qué "el resto" es más grande que el saldo', () => {
    expect(firstAccountRestNote(-500_00)).not.toBeNull()
  })

  it('con apertura cero o positiva, no hace falta aclarar nada', () => {
    expect(firstAccountRestNote(0)).toBeNull()
    expect(firstAccountRestNote(100_00)).toBeNull()
  })
})

describe('stopUsingAccountsSummary', () => {
  it('plurales y singulares', () => {
    expect(stopUsingAccountsSummary(1)).toContain('1 cuenta')
    expect(stopUsingAccountsSummary(3)).toContain('3 cuentas')
  })
})
