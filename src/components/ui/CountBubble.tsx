/** Burbuja de conteo — cantidad de filtros activos en el botón "Filtros" de Movimientos. */
export function CountBubble({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="ml-0.5 grid size-[17px] place-items-center rounded-full bg-accent text-[11px] font-semibold text-on-accent"
    >
      {count}
    </span>
  )
}
