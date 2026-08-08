import { Skeleton } from '@/components/ui/Skeleton'

/** Fallback de `<Suspense>` para las rutas cargadas con `React.lazy` — misma silueta que el
 *  header + panel que arma la mayoría de las páginas, para que no haya salto de layout. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-64 w-full rounded-panel" />
    </div>
  )
}
