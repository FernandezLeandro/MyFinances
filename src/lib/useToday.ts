import { useEffect, useState } from 'react'
import { msUntilNextDay } from '@/lib/dates'

/**
 * "Hoy", pero que se entera cuando cruza la medianoche — sin recargar la página. FI-23 del QA de
 * Fijos: `useCycle` (y cualquier otra pantalla que necesite "hoy") calculaba la fecha una sola vez al
 * montar (`useMemo(() => new Date(), [])`); con la app abierta toda la noche, a las 00:02 del 1/10
 * seguía mostrando septiembre — sólo se corregía al navegar (lo que sea que remontara el componente).
 *
 * Programa un `setTimeout` a la próxima medianoche local (`msUntilNextDay`) para recalcular. Además
 * revisa en cada `visibilitychange`/`focus`: una PWA suspendida en segundo plano (pantalla apagada,
 * app cambiada) puede no correr `setTimeout` mientras está en pausa — al volver a primer plano hay
 * que confirmar "hoy" de nuevo, no confiar en que el timer haya disparado a tiempo.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    function sync() {
      setToday((prev) => {
        const now = new Date()
        // Evita un re-render (y una cascada de recálculos en cada pantalla que use este hook) cuando
        // en los hechos sigue siendo el mismo día — `sync` se llama seguido (focus, visibilitychange).
        return now.toDateString() === prev.toDateString() ? prev : now
      })
    }

    const timer = setTimeout(sync, msUntilNextDay())
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
    // Se reprograma solo: cada `sync` que sí cambia el día dispara este efecto de nuevo (por el
    // cambio de estado), lo que arma el próximo `setTimeout` con el `msUntilNextDay()` correcto para
    // el nuevo "hoy" — no hace falta un intervalo recurrente.
  }, [today])

  return today
}
