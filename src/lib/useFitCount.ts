import { useCallback, useEffect, useRef, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 1024px)' // mismo breakpoint que `lg:` en Tailwind

interface UseFitCountOptions {
  /** Piso: lo mínimo que se muestra siempre, incluso si no entra sin scrollear. */
  min: number
  /** Techo: por más aire que sobre, nunca se pasa de acá — evita que un monitor gigante convierta
   *  un widget de resumen en una lista larga. */
  max: number
  /** Margen inferior a respetar además del borde de la ventana — el padding del `<main>`, la isla
   *  de mobile, etc. */
  bottomMarginPx?: number
}

/**
 * Cuántos ítems entran, de `min` a `max`, sin obligar a scrollear la página — pensado para un
 * widget que puede mostrar "más si hay lugar" en escritorio (el resumen de Movimientos de Hoy).
 * Sólo crece por encima de `min` en escritorio (`min-width: 1024px`); en mobile queda fijo en `min`.
 *
 * Cómo mide: el consumidor renderiza `count` ítems dentro del nodo que recibe `containerRef` — el
 * que contiene TODO lo que ocupa espacio, encabezados de grupo incluidos — y este hook compara el
 * alto ya renderizado contra el alto disponible desde el techo de ese nodo hasta el borde inferior
 * de la ventana. Si sobra lugar y no se llegó a `max`, suma un ítem; si se pasó, resta uno —
 * convergiendo en un puñado de renders, nunca en un loop dentro del mismo render.
 *
 * `containerRef` es un ref función, no un `useRef` plano: el nodo real suele aparecer recién cuando
 * termina de cargar la data (antes hay un skeleton, sin ref) — con un `useRef` normal, el efecto que
 * dispara la primera medición ya corrió mientras el nodo todavía no existía, y el conteo se quedaba
 * pegado en `min` hasta el próximo resize manual. El ref función mide apenas React monta el nodo de
 * verdad, sea cual sea el motivo, y deja armado el `ResizeObserver` que sigue el resto de los
 * cambios (cada vez que `count` cambia, el propio contenedor cambia de alto y el observer vuelve a
 * medir solo).
 */
export function useFitCount({ min, max, bottomMarginPx = 0 }: UseFitCountOptions) {
  const [count, setCount] = useState(min)

  // Snapshot de los parámetros vigentes: así `measure` puede quedar estable (sin recrearse) sin
  // dejar de leer siempre el último `min`/`max`/`bottomMarginPx`.
  const paramsRef = useRef({ min, max, bottomMarginPx })
  paramsRef.current = { min, max, bottomMarginPx }

  const measure = useCallback((node: HTMLDivElement | null) => {
    const { min, max, bottomMarginPx } = paramsRef.current
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setCount(min)
      return
    }
    if (!node) return
    const budget = window.innerHeight - node.getBoundingClientRect().top - bottomMarginPx
    const used = node.getBoundingClientRect().height
    setCount((c) => {
      if (used < budget && c < max) return c + 1
      if (used > budget && c > min) return c - 1
      return c
    })
  }, [])

  const nodeRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (nodeRef.current && observerRef.current) observerRef.current.unobserve(nodeRef.current)
      nodeRef.current = node
      if (node) {
        observerRef.current ??= new ResizeObserver(() => measure(nodeRef.current))
        observerRef.current.observe(node)
        measure(node)
      }
    },
    [measure],
  )

  useEffect(() => {
    const onWindowChange = () => measure(nodeRef.current)
    const mql = window.matchMedia(DESKTOP_QUERY)
    window.addEventListener('resize', onWindowChange)
    mql.addEventListener('change', onWindowChange)
    return () => {
      window.removeEventListener('resize', onWindowChange)
      mql.removeEventListener('change', onWindowChange)
      observerRef.current?.disconnect()
    }
  }, [measure])

  return { containerRef, count }
}
