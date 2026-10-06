import { createContext } from 'react'

/** Qué marcador de la maqueta está resaltado: lo fija la leyenda al pasarle el mouse a un ítem y lo
 *  lee cada `HelpMarker`. Fuera de un `HelpAnnotated` no hace nada. */
export const MarkerContext = createContext<{ active: number | null; setActive: (n: number | null) => void }>({
  active: null,
  setActive: () => {},
})
