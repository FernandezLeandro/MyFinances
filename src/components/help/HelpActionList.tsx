import { HelpChip } from '@/components/help/HelpChip'
import type { HelpAction } from '@/components/help/types'
import { cn } from '@/lib/cn'

interface HelpActionListProps {
  actions: HelpAction[]
  /** Una aclaración al pie de la lista (lo que no siempre aparece, por ejemplo). */
  footnote?: string
}

/** "Cada acción y qué le hace a tu saldo": nombre + chip de efecto a la izquierda, descripción a la
 *  derecha. Desde `sm` son dos columnas; en el celular se apilan. El ancho lo decide la sección que la
 *  contiene (`HelpSection` con `narrow`): a 1600px los renglones de descripción no se leen. */
export function HelpActionList({ actions, footnote }: HelpActionListProps) {
  return (
    <div className="rounded-panel bg-surface px-[22px] pt-2 pb-[22px]">
      <ul>
        {actions.map((action) => (
          <li
            key={action.id}
            className="grid gap-x-[22px] gap-y-1.5 border-b border-divider-list py-4 last:border-b-0 last:pb-1 sm:grid-cols-[minmax(170px,210px)_minmax(0,1fr)]"
          >
            <div>
              <h3 className={cn('text-sm font-semibold', action.destructive && 'text-negative')}>{action.name}</h3>
              <div className="mt-2">
                <HelpChip tone={action.effect.tone}>{action.effect.label}</HelpChip>
              </div>
            </div>
            <p className="text-[13.5px] leading-[1.6] text-fg-secondary text-pretty">{action.description}</p>
          </li>
        ))}
      </ul>
      {footnote && <p className="mt-3.5 text-[12.5px] leading-normal text-fg-muted text-pretty">{footnote}</p>}
    </div>
  )
}
