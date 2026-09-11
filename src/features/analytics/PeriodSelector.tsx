import { Input } from '@/components/ui/Input'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { DEFAULT_CYCLE_CONFIG, type CycleConfig } from '@/lib/cycle'
import {
  PERIOD_PRESET_LABELS,
  PERIOD_PRESET_MOBILE_LABELS,
  presetToRange,
  type Period,
  type PeriodPreset,
} from '@/features/analytics/period'

const PRESETS: PeriodPreset[] = ['month', '3m', 'custom']

export function PeriodSelector({
  value,
  onChange,
  config = DEFAULT_CYCLE_CONFIG,
}: {
  value: Period
  onChange: (period: Period) => void
  /** Ciclo configurado por el usuario — sólo afecta al preset 'month' (ver `presetToRange`). */
  config?: CycleConfig
}) {
  function selectPreset(preset: PeriodPreset) {
    if (preset === 'custom') {
      onChange({ ...value, preset: 'custom' })
      return
    }
    onChange({ ...value, preset, ...presetToRange(preset, value.anchor, config) })
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {/* Mobile: pista `bg-fill-subtle` a todo el ancho, texto corto — con las etiquetas largas de
          escritorio ("Últimos 3 meses") ni entraban en una fila a 390px, y el `PillTabs` viejo no
          tenía ningún mecanismo para achicarse ni bajar de línea (desbordaba el header entero).
          Reusa `SegmentedToggle` (el mismo Todos/Gastos/Ingresos de Movimientos) en vez de un
          componente aparte. */}
      <div className="w-full lg:hidden">
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

      {/* Siempre en su propia línea, a todo el ancho disponible del selector — nunca compartiendo
          fila con las píldoras: con las dos inline (como antes) el par de `<input type="date">`
          nativos, que tienen su propio ancho mínimo impuesto por el navegador y no pueden encogerse
          más allá de eso, terminaba empujando el segundo input fuera del panel en vez de bajar de
          línea (el `flex-wrap` del contenedor sólo bajaba de línea el selector completo, no sus
          hijos sueltos). */}
      {value.preset === 'custom' && (
        <div className="flex w-full items-center gap-2">
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 min-w-0 flex-1 text-[13px]"
          />
          <span aria-hidden className="shrink-0 text-fg-muted">
            –
          </span>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 min-w-0 flex-1 text-[13px]"
          />
        </div>
      )}
    </div>
  )
}
