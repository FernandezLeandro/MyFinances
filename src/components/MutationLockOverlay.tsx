import { useIsMutating } from '@tanstack/react-query'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Se prende solo con cualquier mutación en curso en toda la app (crear/editar/borrar un
 * movimiento, marcar un fijo como pagado, etc.) — no con las lecturas normales, que ya tienen
 * sus propios estados vacíos/de carga. El overlay a pantalla completa bloquea clics por
 * construcción: no hace falta deshabilitar la nav ni cada botón a mano.
 */
export function MutationLockOverlay() {
  const isMutating = useIsMutating()
  if (!isMutating) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 backdrop-blur-[1px]"
    >
      <div className="flex items-center gap-3 rounded-panel bg-ink-900 px-5 py-3.5 shadow-lift ring-1 ring-ink-800">
        <Spinner className="text-acid" />
        <span className="text-[13px] text-chalk-dim">Guardando…</span>
      </div>
    </div>
  )
}
