import { useEffect, useState } from 'react'

/**
 * `true`/`false` según un media query, reactivo a resize/cambio de breakpoint. A diferencia de
 * ocultar con CSS (`hidden lg:flex`), lo que no matchea nunca llega a montarse — necesario para
 * contenido que no tolera vivir en un contenedor de tamaño 0 (recharts' `ResponsiveContainer` mide
 * su caja con un `ResizeObserver` y se queja a los gritos si le toca 0×0, como le pasaba al
 * `CategoryDonut` de Hoy escondido con `display:none` en mobile).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
