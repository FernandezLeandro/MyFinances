/** `--ease-out-quint` de `theme.css`, para las animaciones de `motion` (que no leen variables CSS). */
export const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const

/** Una fila que entra o sale de una lista (pagar un fijo la mueve al rail de «Pagados», guardar
 *  despliega el editor de una compra): sin esto desaparece y reaparece de golpe. `height` (no `scale`)
 *  porque la fila tiene que ceder su lugar a las de abajo; `initial={false}` en cada `AnimatePresence`
 *  evita que se anime la carga de la pantalla o el cambio de ciclo. */
export const ROW_PRESENCE = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: EASE_OUT_QUINT },
} as const
