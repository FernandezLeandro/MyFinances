import { useEffect, useRef, useState } from 'react'
import { animate } from 'motion'
import { useReducedMotion } from 'motion/react'

/**
 * Anima un número entero (centavos) desde su valor anterior hasta `target`. Arranca en `target`
 * mismo la primera vez que se monta (nada de contar desde 0 en cada carga de página) y sólo
 * anima cuando el valor efectivamente cambia — p.ej. al cargar un movimiento nuevo.
 * `animate` de `motion` no pasa por `MotionConfig`, así que «reducir movimiento» se mira acá.
 */
export function useCountUp(target: number, durationSeconds = 0.7): number {
  const [display, setDisplay] = useState(target)
  const previous = useRef(target)
  const isFirstRender = useRef(true)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (isFirstRender.current || reduceMotion) {
      isFirstRender.current = false
      previous.current = target
      return
    }

    const controls = animate(previous.current, target, {
      duration: durationSeconds,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => setDisplay(Math.round(value)),
    })

    previous.current = target
    return () => controls.stop()
  }, [target, durationSeconds, reduceMotion])

  return reduceMotion ? target : display
}
