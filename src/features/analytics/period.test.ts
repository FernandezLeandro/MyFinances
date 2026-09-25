import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import type { CycleConfig } from '@/lib/cycle'
import { comparisonRange, defaultPeriod, presetToRange, previousRange, shiftPeriodMonth, type Period } from './period'

// `new Date(2026, 8, 10)` (constructor local) — mismo gotcha de siempre con `new Date(string)`.
const ANCHOR = format(new Date(2026, 8, 10), 'yyyy-MM-dd')

const monthly: CycleConfig = { kind: 'monthly', weekStartsOn: 1 }
const biweekly: CycleConfig = { kind: 'biweekly', weekStartsOn: 1 }
const weekly: CycleConfig = { kind: 'weekly', weekStartsOn: 1 }

function monthPeriod(anchor: string): Period {
  return { preset: 'month', anchor, from: '', to: '' }
}

describe('presetToRange — preset "month" con ciclo configurado', () => {
  it('sin config (default), el preset month es el mes calendario de siempre', () => {
    expect(presetToRange('month', ANCHOR)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('con config mensual explícita, no-op — idéntico al default', () => {
    expect(presetToRange('month', ANCHOR, monthly)).toEqual(presetToRange('month', ANCHOR))
  })

  it('con config quincenal, "month" pasa a representar la quincena en curso', () => {
    // ANCHOR = 10 de septiembre → primera quincena.
    expect(presetToRange('month', ANCHOR, biweekly)).toEqual({ from: '2026-09-01', to: '2026-09-15' })
  })

  it('con config semanal, "month" pasa a representar la semana en curso', () => {
    // 10 de septiembre de 2026 es jueves → semana (lunes a domingo) 7–13 sep.
    expect(presetToRange('month', ANCHOR, weekly)).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })

  it('el preset "3m" se queda calendario siempre, sin importar la config', () => {
    expect(presetToRange('3m', ANCHOR, biweekly)).toEqual(presetToRange('3m', ANCHOR, monthly))
  })
})

describe('defaultPeriod', () => {
  it('usa el ciclo configurado para el rango inicial', () => {
    const period = defaultPeriod(biweekly)
    expect(period.preset).toBe('month')
    expect(period.from).not.toBe(period.to)
  })
})

describe('shiftPeriodMonth — preset "month" mueve un ciclo, no un mes a secas', () => {
  it('con ciclo mensual, mover ±1 es exactamente addMonths/subMonths de siempre', () => {
    const next = shiftPeriodMonth(monthPeriod(ANCHOR), 1, monthly)
    expect(next).toEqual({ preset: 'month', anchor: '2026-10-01', from: '2026-10-01', to: '2026-10-31' })
  })

  it('con ciclo quincenal, mover +1 avanza a la quincena siguiente, no al mes siguiente', () => {
    const next = shiftPeriodMonth(monthPeriod(ANCHOR), 1, biweekly)
    expect(next).toEqual({ preset: 'month', anchor: '2026-09-16', from: '2026-09-16', to: '2026-09-30' })
  })

  it('preset "custom" sólo mueve el ancla, no toca from/to', () => {
    const custom: Period = { preset: 'custom', anchor: ANCHOR, from: '2020-01-01', to: '2020-01-31' }
    const next = shiftPeriodMonth(custom, 1, biweekly)
    expect(next).toEqual({ preset: 'custom', anchor: '2026-10-10', from: '2020-01-01', to: '2020-01-31' })
  })
})

describe('comparisonRange', () => {
  it('con preset "month" y ciclo mensual, el período anterior es el mes calendario anterior', () => {
    const range = presetToRange('month', ANCHOR, monthly)
    expect(comparisonRange(monthPeriod(ANCHOR), range, monthly)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('con preset "month" y ciclo quincenal, el período anterior es la QUINCENA anterior real — no necesariamente el mismo largo en días', () => {
    // ANCHOR está en la 1ª quincena de septiembre (15 días) → la anterior es la 2ª de agosto (16 días).
    const range = presetToRange('month', ANCHOR, biweekly)
    expect(comparisonRange(monthPeriod(ANCHOR), range, biweekly)).toEqual({ from: '2026-08-16', to: '2026-08-31' })
  })

  it('con preset "3m", sigue siendo el mismo largo en días hacia atrás (previousRange), sin importar la config', () => {
    const range = presetToRange('3m', ANCHOR, biweekly)
    const withCycle = comparisonRange({ preset: '3m', anchor: ANCHOR }, range, biweekly)
    const withoutCycle = comparisonRange({ preset: '3m', anchor: ANCHOR }, range, monthly)
    expect(withCycle).toEqual(withoutCycle)
  })

  // Regresión AN-03 (QA de Análisis): "Personalizado" con una fecha borrada llegaba acá con
  // `from`/`to` vacío — `parseISO('')` da fecha inválida y `format()` tiraba `Invalid time value`
  // sin capturar, tumbando toda la pantalla (React descarta el árbol entero sin error boundary).
  it('con preset "custom" y una fecha vacía, no explota — devuelve el rango tal cual', () => {
    const period: Period = { preset: 'custom', anchor: ANCHOR, from: '', to: '2026-09-15' }
    expect(() => comparisonRange(period, { from: '', to: '2026-09-15' }, monthly)).not.toThrow()
    expect(comparisonRange(period, { from: '', to: '2026-09-15' }, monthly)).toEqual({ from: '', to: '2026-09-15' })
  })
})

describe('previousRange', () => {
  it('fecha inválida en cualquiera de las dos puntas: devuelve el rango de entrada, no explota', () => {
    expect(() => previousRange('', '2026-09-15')).not.toThrow()
    expect(previousRange('', '2026-09-15')).toEqual({ from: '', to: '2026-09-15' })
    expect(previousRange('2026-09-01', '')).toEqual({ from: '2026-09-01', to: '' })
  })
})
