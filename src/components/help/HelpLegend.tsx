import { HelpMarker } from '@/components/help/HelpMarker'
import type { HelpLegendItem } from '@/components/help/types'

/** La leyenda de una maqueta anotada: el mismo número que el marcador, con su explicación. Va en 1/2/3
 *  columnas y no en `auto-fit`: con seis ítems, a pantalla ancha `auto-fit` deja el último solo. Es lo que
 *  lee un lector de pantalla — la maqueta en sí es decorativa. */
export function HelpLegend({ items }: { items: HelpLegendItem[] }) {
  return (
    <ol className="grid grid-cols-1 gap-x-[26px] gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => (
        <li key={item.lead} className="flex gap-2.5">
          <HelpMarker n={i + 1} tone="legend" />
          <p className="text-[13px] leading-[1.55] text-fg-secondary text-pretty">
            <strong className="font-semibold text-fg">{item.lead}</strong> {item.body}
          </p>
        </li>
      ))}
    </ol>
  )
}
