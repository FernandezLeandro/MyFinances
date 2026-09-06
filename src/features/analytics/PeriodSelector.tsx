import { Input } from '@/components/ui/Input'
import { PillTab, PillTabs } from '@/components/ui/PillTabs'
import { PERIOD_PRESET_LABELS, presetToRange, type Period, type PeriodPreset } from '@/features/analytics/period'

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
    <div className="flex flex-wrap items-center gap-3">
      <PillTabs>
        {PRESETS.map((preset) => (
          <PillTab key={preset} active={value.preset === preset} onClick={() => selectPreset(preset)}>
            {PERIOD_PRESET_LABELS[preset]}
          </PillTab>
        ))}
      </PillTabs>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 text-[13px]"
          />
          <span aria-hidden className="text-fg-muted">
            –
          </span>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 text-[13px]"
          />
        </div>
      )}
    </div>
  )
}
