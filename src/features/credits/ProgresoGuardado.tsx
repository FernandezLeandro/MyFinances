/** No hay componente de progreso en `components/ui/` (no existe en todo el repo) — un solo call
 *  site acá no lo justifica, así que queda local a la feature. Idioma visual del resto de la app:
 *  superficie que se eleva por luminosidad (`bg-ink-800`), acento ácido reservado al dato que
 *  importa (cuánto ya se juntó), nunca semáforo. */
export function ProgresoGuardado({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100)

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-ink-800"
    >
      <div className="h-full rounded-full bg-acid transition-[width] duration-300" style={{ width: `${clamped}%` }} />
    </div>
  )
}
