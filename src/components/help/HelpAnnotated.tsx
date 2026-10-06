import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { MarkerContext } from '@/components/help/marker-context'

/**
 * Una maqueta anotada con su leyenda debajo. Ocupa lo que le den: el ancho lo decide la sección que la
 * contiene (`HelpSection` con `narrow`), porque el título tiene que achicarse junto con ella. Comparte
 * con la leyenda y los marcadores cuál está resaltado (`MarkerContext`).
 */
export function HelpAnnotated({ diagram, legend }: { diagram: ReactNode; legend: ReactNode }) {
  const [active, setActive] = useState<number | null>(null)
  const value = useMemo(() => ({ active, setActive }), [active])
  return (
    <MarkerContext.Provider value={value}>
      <div className="flex flex-col gap-[14px]">
        {diagram}
        {legend}
      </div>
    </MarkerContext.Provider>
  )
}
