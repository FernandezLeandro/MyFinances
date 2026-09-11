import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useProfile } from '@/features/profile/api'
import {
  cycleContaining,
  cycleFromUrlParam,
  DEFAULT_CYCLE_CONFIG,
  isCurrentCycle,
  shiftCycle,
  type Cycle,
  type CycleConfig,
} from './cycle'

/** Nombre del query param que guarda la posición del ciclo — corto y en español, a tono con el
 *  resto de la URL de la app (`?categoria=`, etc. si existieran). Cada ruta tiene el suyo propio
 *  porque el param vive en el `search` de esa página; navegar entre pantallas no lo arrastra. */
const CYCLE_PARAM = 'ciclo'

export interface UseCycleResult {
  /** El ciclo elegido por el usuario en Ajustes (o el default mensual si el perfil no cargó todavía
   *  — mismo criterio que el resto de la app: un instante de "mensual" mientras carga no es
   *  observable, nunca se llega a pintar antes de que `useProfile` resuelva). */
  config: CycleConfig
  /** El ciclo que esta pantalla está mostrando ahora mismo — de la URL si hay uno válido, si no el
   *  que contiene a hoy. */
  cycle: Cycle
  /** El ciclo que contiene a hoy, SIEMPRE — independiente de a qué ciclo se navegó. Junto con
   *  `cycle`, es el insumo de `projectionWindow` (`src/lib/cycle.ts`): el saldo proyectado de un
   *  ciclo futuro necesita saber dónde está "hoy" para poder extender la ventana hacia atrás. */
  current: Cycle
  /** `true` si `cycle` es el que contiene a hoy — para pintar distinto o esconder una acción
   *  "volver a hoy" que no tendría nada que hacer. */
  isCurrent: boolean
  goToPrev: () => void
  goToNext: () => void
  /** Vuelve al ciclo de hoy — limpia el param de la URL en vez de fijarlo, así la URL queda
   *  "limpia" cuando se está mirando el presente (que es el caso común). */
  goToToday: () => void
}

/** Sólo la config del ciclo (qué eligió el usuario en Ajustes), sin URL ni navegación — para una
 *  pantalla que necesita SABER el ciclo configurado pero maneja su propia posición por otro lado
 *  (Movimientos, que ya tiene su propio sistema de presets/`anchor` en `useMovimientosFilters`, no
 *  el `?ciclo=` de acá). `useCycle()` (abajo) la reusa, así que un solo lugar decide "qué es la
 *  config" para toda la app. */
export function useCycleConfig(): CycleConfig {
  const { data: profile } = useProfile()
  return useMemo(
    () => (profile ? { kind: profile.cycleKind, weekStartsOn: profile.cycleWeekStartsOn } : DEFAULT_CYCLE_CONFIG),
    [profile],
  )
}

/**
 * Ciclo de caja de la pantalla actual — capa fina sobre `src/lib/cycle.ts` que lo conecta con el
 * perfil (de dónde sale `config`) y con la URL (dónde vive la posición). Sin lógica propia más allá
 * de eso a propósito: toda la aritmética de ciclos, y el único caso raro (URL manipulada a mano),
 * vive en `cycleFromUrlParam` — puro y testeado en `cycle.test.ts`. Este hook no tiene test de
 * regresión automático (usa DOM/React), se verifica a mano en el navegador — mismo criterio que ya
 * documenta el README para el resto de los hooks de la app.
 *
 * Cada pantalla que navega por ciclo con ESTE hook (Fijos, Mis Deudas) lo llama por su cuenta: el
 * param queda en la URL de esa ruta, así que recargar la página — o volver con el botón atrás del
 * navegador — no pierde la posición. No hay estado compartido entre pantallas: es el mismo criterio
 * que ya usaba cada `useState` local que este hook reemplaza. Movimientos y Análisis NO usan este
 * hook para su posición — usan `useCycleConfig()` sólo para saber el `kind`, porque ya tienen su
 * propio mecanismo de período (presets + `anchor`, con más opciones que sólo "el ciclo del usuario").
 */
export function useCycle(): UseCycleResult {
  const config = useCycleConfig()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlId = searchParams.get(CYCLE_PARAM)
  const today = useMemo(() => new Date(), [])
  const cycle = useMemo(() => cycleFromUrlParam(config, urlId, today), [config, urlId, today])
  const current = useMemo(() => cycleContaining(config, today), [config, today])
  const isCurrent = isCurrentCycle(cycle, today)

  // `replace: true`: cada click de flecha no debe apilar una entrada de historial — con 52 ciclos
  // al año eso llenaría el "atrás" del navegador de pasos que nadie quiere recorrer uno por uno
  // (distinto de una navegación real de página, que sí merece su entrada).
  const goTo = useCallback(
    (next: Cycle) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (isCurrentCycle(next, today)) params.delete(CYCLE_PARAM)
          else params.set(CYCLE_PARAM, next.id)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams, today],
  )

  const goToPrev = useCallback(() => goTo(shiftCycle(config, cycle, -1)), [goTo, config, cycle])
  const goToNext = useCallback(() => goTo(shiftCycle(config, cycle, 1)), [goTo, config, cycle])
  const goToToday = useCallback(() => goTo(cycleFromUrlParam(config, null, today)), [goTo, config, today])

  return { config, cycle, current, isCurrent, goToPrev, goToNext, goToToday }
}
