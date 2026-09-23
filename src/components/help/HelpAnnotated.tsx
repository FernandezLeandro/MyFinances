import type { ReactNode } from 'react'

/**
 * Una maqueta anotada con su leyenda debajo. Ocupa lo que le den: el ancho lo decide la sección que la
 * contiene (`HelpSection` con `narrow`), porque el título tiene que achicarse junto con ella.
 */
export function HelpAnnotated({ diagram, legend }: { diagram: ReactNode; legend: ReactNode }) {
  return (
    <div className="flex flex-col gap-[14px]">
      {diagram}
      {legend}
    </div>
  )
}
