import { format, startOfMonth, subMonths } from 'date-fns'

export type PeriodPreset = 'month' | '3m' | '6m' | '12m' | 'custom'

export interface Period {
  preset: PeriodPreset
  from: string
  to: string
}

const MONTHS_BACK: Record<Exclude<PeriodPreset, 'custom'>, number> = {
  month: 0,
  '3m': 2,
  '6m': 5,
  '12m': 11,
}

export function presetToRange(preset: Exclude<PeriodPreset, 'custom'>): { from: string; to: string } {
  const now = new Date()
  return {
    from: format(startOfMonth(subMonths(now, MONTHS_BACK[preset])), 'yyyy-MM-dd'),
    to: format(now, 'yyyy-MM-dd'),
  }
}

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  month: 'Este mes',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '12m': 'Últimos 12 meses',
  custom: 'Personalizado',
}

export function defaultPeriod(): Period {
  return { preset: 'month', ...presetToRange('month') }
}
