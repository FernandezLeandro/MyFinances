import { Panel } from '@/components/ui/Panel'
import { EmptyState } from '@/components/ui/EmptyState'

export function Fijos() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Gastos fijos</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Fijos</h1>
      </header>

      <Panel>
        <EmptyState
          glyph="◷"
          title="Todavía no está"
          hint="El alta de gastos fijos, marcar como pagado y el saldo proyectado a fin de mes llegan en el Bloque 3."
        />
      </Panel>
    </div>
  )
}
