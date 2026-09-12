import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { Stat, StatRow } from '@/components/ui/Stat'
import { StackedBar } from '@/components/ui/StackedBar'

interface FijosCicloCardProps {
  /** "septiembre" / "1–15 sep" / lo que devuelva `cycleShortLabel(cycle)` — mismo copy que ya usa
   *  Fijos.tsx para el ciclo. */
  cycleLabel: string
  /** Pagado + pendiente de TODOS los fijos elegibles del ciclo (bolsas incluidas). */
  totalCents: number
  paidCents: number
  /** Bloque 3, sólo fijos "una vez al mes": `summarizeFixedExpenses.savedTotalCents`. */
  savedCents: number
  /** `summarizeFixedExpenses.missingToSaveCents` — 0 si no hay nada pendiente de guardar. */
  missingToSaveCents: number
  /** `summarizeFixedExpenses.pendingTotalCents`. */
  pendingCents: number
  hidden: boolean
  onRegister: () => void
}

/**
 * Reemplaza el hero de saldo en Hoy para un plan sin `movimientos-manuales` (BASIC, bloque 4 del
 * plan "BASIC centrado en fijos"): ese plan no registra ingresos ni gastos sueltos, así que "Saldo
 * actual" no tiene con qué calcularse — lo que sí tiene sentido mostrarle es cuánto suman sus fijos
 * este ciclo, cuánto ya pagó o guardó, y cuánto le falta.
 *
 * Sin nada guardado, la cifra principal es lo que falta pagar (el dato que de verdad importa acá).
 * Con algo guardado, pasa a ser el total del ciclo — da el contexto de cuánto es "todo", con
 * Pagado/Guardado/Falta pagar abajo como desglose.
 */
export function FijosCicloCard({
  cycleLabel,
  totalCents,
  paidCents,
  savedCents,
  missingToSaveCents,
  pendingCents,
  hidden,
  onRegister,
}: FijosCicloCardProps) {
  const hasSaved = savedCents > 0
  const paidPct = totalCents > 0 ? Math.min((paidCents / totalCents) * 100, 100) : 0
  const savedPct = totalCents > 0 ? Math.min((savedCents / totalCents) * 100, 100) : 0
  const restPct = Math.max(100 - paidPct - savedPct, 0)

  return (
    <Panel className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Fijos de {cycleLabel}</p>
        <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={onRegister}>
          Registrar
        </Button>
      </div>

      <div>
        <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">
          {hasSaved ? 'Total del ciclo' : 'Falta pagar'}
        </p>
        <Money
          cents={hasSaved ? totalCents : pendingCents}
          size="hero"
          tone={hasSaved ? 'fg' : pendingCents > 0 ? 'negative' : 'fg'}
          hidden={hidden}
          className="mt-1"
        />
      </div>

      <StackedBar
        segments={[
          { pct: paidPct, color: 'var(--color-accent)' },
          { pct: savedPct, color: 'var(--color-fg-muted)' },
          { pct: restPct, color: 'var(--color-negative)' },
        ]}
      />

      <StatRow className="flex-wrap gap-x-7 gap-y-3">
        <Stat label="Pagado">
          <Money cents={paidCents} tone="accent" size="figure" hidden={hidden} />
        </Stat>
        {hasSaved && (
          <Stat label="Guardado">
            <Money cents={savedCents} tone="fg" size="figure" hidden={hidden} />
          </Stat>
        )}
        {/* Sin nada guardado, "Falta pagar" ya es la cifra principal de arriba — repetirla acá
            abajo es la misma cifra dos veces sin aportar nada. */}
        {hasSaved && (
          <Stat label="Falta pagar">
            <Money cents={pendingCents} tone={pendingCents > 0 ? 'negative' : 'fg'} size="figure" hidden={hidden} />
          </Stat>
        )}
        {hasSaved && missingToSaveCents > 0 && (
          <Stat label="Te falta guardar">
            <Money cents={missingToSaveCents} tone="fg" size="figure" hidden={hidden} />
          </Stat>
        )}
      </StatRow>

      <Link to="/fijos" className="text-[12px] font-semibold text-accent-text">
        Ver fijos
      </Link>
    </Panel>
  )
}
