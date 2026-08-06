import { Button } from '@/components/ui/Button'

interface ErrorStateProps {
  title?: string
  onRetry?: () => void
  className?: string
}

/** Para cuando una query falla — nunca dejar la pantalla en blanco sin explicación. */
export function ErrorState({ title = 'No se pudo cargar', onRetry, className }: ErrorStateProps) {
  return (
    <div className={className} role="alert">
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span aria-hidden className="font-display text-3xl text-coral">
          !
        </span>
        <p className="text-[14px] text-chalk-dim">{title}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  )
}
