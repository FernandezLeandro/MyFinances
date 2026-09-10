import { Input } from '@/components/ui/Input'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESET_MOBILE_LABELS,
  presetToRange,
  type Period,
  type PeriodPreset,
} from '@/features/analytics/period'

const PRESETS: PeriodPreset[] = ['month', '3m', '6m', '12m', 'custom']

export function PeriodSelector({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  function selectPreset(preset: PeriodPreset) {
    if (preset === 'custom') {
      onChange({ ...value, preset: 'custom' })
      return
    }
    onChange({ ...value, preset, ...presetToRange(preset, value.anchor) })
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
      {/* Mobile: pista `bg-fill-subtle` a todo el ancho, texto corto — con las 5 etiquetas largas
          de escritorio ("Últimos 12 meses") ni entraban en una fila a 390px, y el `PillTabs` viejo
          no tenía ningún mecanismo para achicarse ni bajar de línea (desbordaba el header entero).
          Reusa `SegmentedToggle` (el mismo Todos/Gastos/Ingresos de Movimientos) en vez de un
          componente aparte. */}
      <div className="lg:hidden">
        <SegmentedToggle
          value={value.preset}
          options={PRESETS.map((preset) => ({ value: preset, label: PERIOD_PRESET_MOBILE_LABELS[preset] }))}
          onChange={selectPreset}
          variant="pill"
          className="w-full"
        />
      </div>
      <div className="hidden lg:block">
        <SegmentedToggle
          value={value.preset}
          options={PRESETS.map((preset) => ({ value: preset, label: PERIOD_PRESET_LABELS[preset] }))}
          onChange={selectPreset}
          variant="pill"
        />
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 min-w-0 flex-1 text-[13px] lg:flex-none"
          />
          <span aria-hidden className="shrink-0 text-fg-muted">
            –
          </span>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 min-w-0 flex-1 text-[13px] lg:flex-none"
          />
        </div>
      )}
    </div>
  )
}
