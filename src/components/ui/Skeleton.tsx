import { cn } from '@/lib/cn'

/** Bloque que pulsa suave. La altura/ancho los define quien lo usa vía className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-chip bg-ink-800', className)} aria-hidden />
}
