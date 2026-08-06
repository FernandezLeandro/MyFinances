import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { PERIOD_PRESET_LABELS, presetToRange, type Period, type PeriodPreset } from '@/features/analytics/period'

const PRESETS: PeriodPreset[] = ['month', '3m', '6m', '12m', 'custom']

export function PeriodSelector({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  function selectPreset(preset: PeriodPreset) {
    if (preset === 'custom') {
      onChange({ ...value, preset: 'custom' })
      return
    }
    onChange({ preset, ...presetToRange(preset) })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Chip key={preset} active={value.preset === preset} onClick={() => selectPreset(preset)}>
            {PERIOD_PRESET_LABELS[preset]}
          </Chip>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 text-[13px]"
          />
          <span aria-hidden className="text-chalk-faint">
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
