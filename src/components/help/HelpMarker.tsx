import { cn } from '@/lib/cn'

type MarkerTone = 'onLight' | 'onInverse' | 'legend'

// Clase completa por tono (ver `HelpChip`). `onLight`/`onInverse` son los de la maqueta (18px, sobre
// el fondo claro y sobre la tarjeta oscura); `legend` es el de la leyenda de abajo (20px, suave).
const tones: Record<MarkerTone, string> = {
  onLight: 'size-[18px] bg-accent text-[10.5px] text-on-accent',
  onInverse: 'size-[18px] bg-on-inverse text-[10.5px] text-inverse',
  legend: 'mt-0.5 size-5 bg-accent-soft text-[11px] text-accent-text',
}

/** El círculo numerado que une un punto de la maqueta con su explicación en la leyenda. */
export function HelpMarker({ n, tone = 'onLight' }: { n: number; tone?: MarkerTone }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-pill leading-none font-semibold',
        tones[tone],
      )}
    >
      {n}
    </span>
  )
}
