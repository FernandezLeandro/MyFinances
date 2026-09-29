import { createContext, useContext } from 'react'

// Un popover propio (el buscador de categoría, por ejemplo) no puede vivir dentro del cuerpo
// scrolleable del diálogo (`overflow-y-auto` lo recorta apenas se abre cerca del final) ni fuera del
// `<dialog>` (perdería el "top layer" nativo y quedaría tapado por el propio diálogo). Este contexto
// da acceso al nodo que sí sirve: hermano del cuerpo y el pie, dentro del `<dialog>`, sin overflow
// propio — `Dialog.tsx` lo provee, cualquier diálogo puede consumirlo.
export const DialogPortalContext = createContext<HTMLDivElement | null>(null)

/** El nodo al que portar un popover abierto dentro de este diálogo (`useState` del lado de
 *  `Dialog.tsx`, no `useRef`: un cambio de `ref.current` no re-renderiza, así que un consumidor que
 *  monta antes que el nodo exista se quedaría con `null` para siempre). `null` fuera de un `Dialog`. */
export function useDialogPortalRoot(): HTMLDivElement | null {
  return useContext(DialogPortalContext)
}
