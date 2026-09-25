import { Link } from 'react-router'
import { Plus, Wallet } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { EyeToggle } from '@/components/ui/EyeToggle'
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
  /** HO-10 del QA de Hoy: todo ingreso no-ajuste del ciclo (`isCycleIncome`, la misma regla que
   *  `AssignIncomeDialog` y `v_range_summary`) — 0 si todavía no cargó nada. */
  incomeCents: number
  onAssignIncome: () => void
  hidden: boolean
  /** HO-14 del QA de Hoy: a diferencia del hero de Premium/Test, esta tarjeta no tenía ojo propio —
   *  una cuenta que ocultó el saldo en un plan superior y bajó a Básico quedaba enmascarada para
   *  siempre, sin forma de destapar. */
  onToggleHidden: () => void
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
  incomeCents,
  onAssignIncome,
  hidden,
  onToggleHidden,
  onRegister,
}: FijosCicloCardProps) {
  const hasSaved = savedCents > 0
  const hasIncome = incomeCents > 0
  // Con sueldo asignado, lo que más le importa al usuario deja de ser "cuánto de lo que ya sé que
  // debo pagar me falta" y pasa a ser "de lo que cobré, cuánto me queda" — por eso pisa a las otras
  // dos variantes en vez de sumarse como una tercera cosa a elegir.
  const available = incomeCents - totalCents
  const paidPct = totalCents > 0 ? Math.min((paidCents / totalCents) * 100, 100) : 0
  const savedPct = totalCents > 0 ? Math.min((savedCents / totalCents) * 100, 100) : 0
  const restPct = Math.max(100 - paidPct - savedPct, 0)

  return (
    <Panel className="flex flex-col gap-5 p-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Fijos de {cycleLabel}</p>
          <EyeToggle hidden={hidden} onToggle={onToggleHidden} label="saldo" />
        </div>
        <div className="flex gap-2">
          <Button
            size="compact"
            variant="outline"
            icon={<Wallet className="size-3.5" strokeWidth={2} aria-hidden />}
            onClick={onAssignIncome}
          >
            Sueldo
          </Button>
          <Button size="compact" icon={<Plus className="size-3.5" strokeWidth={2} aria-hidden />} onClick={onRegister}>
            Registrar
          </Button>
        </div>
      </div>

      <div>
        <p className="text-[10.5px] font-semibold tracking-[0.09em] text-fg-muted uppercase">
          {hasIncome ? 'Disponible' : hasSaved ? 'Total del ciclo' : 'Falta pagar'}
        </p>
        <Money
          cents={hasIncome ? available : hasSaved ? totalCents : pendingCents}
          size="hero"
          tone={hasIncome ? (available < 0 ? 'negative' : 'fg') : hasSaved ? 'fg' : pendingCents > 0 ? 'negative' : 'fg'}
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
        {hasIncome && (
          <Stat label="Ingresos del ciclo">
            <Money cents={incomeCents} tone="fg" size="figure" hidden={hidden} />
          </Stat>
        )}
        <Stat label="Pagado">
          <Money cents={paidCents} tone="accent" size="figure" hidden={hidden} />
        </Stat>
        {hasSaved && (
          <Stat label="Guardado">
            <Money cents={savedCents} tone="fg" size="figure" hidden={hidden} />
          </Stat>
        )}
        {/* Sin nada guardado ni sueldo asignado, "Falta pagar" ya es la cifra principal de arriba
            — repetirla acá abajo es la misma cifra dos veces sin aportar nada. */}
        {(hasSaved || hasIncome) && (
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
