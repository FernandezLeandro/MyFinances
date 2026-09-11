import { cycleLabel, cycleShortLabel, type Cycle } from '@/lib/cycle'
import { MonthNav } from './MonthNav'

interface CycleNavProps {
  cycle: Cycle
  onPrev: () => void
  onNext: () => void
}

/**
 * Wrapper de `MonthNav` para cualquier `kind` de ciclo, no sólo mensual — `MonthNav` sigue siendo
 * presentacional puro (label + callbacks) y no se toca; acá sólo se traduce el `Cycle` a los dos
 * labels que ya sabía pintar (`cycleLabel`/`cycleShortLabel` en `src/lib/cycle.ts`).
 *
 * Los `aria-label` de `MonthNav` ("Mes anterior"/"Mes siguiente") quedan fijos incluso con un ciclo
 * semanal o quincenal — deuda de accesibilidad conocida y aceptada para este bloque: generalizarlos
 * ("Período anterior") es un cambio de una palabra en `MonthNav`, mejor hacerlo junto con el bloque
 * que de verdad habilita quincenal/semanal en las pantallas, no antes de que nadie los use.
 */
export function CycleNav({ cycle, onPrev, onNext }: CycleNavProps) {
  return <MonthNav label={cycleLabel(cycle)} mobileLabel={cycleShortLabel(cycle)} onPrev={onPrev} onNext={onNext} />
}
