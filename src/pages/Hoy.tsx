import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Money } from '@/components/ui/Money'
import { TransactionRow } from '@/components/TransactionRow'
import { Link } from 'react-router'
import {
  categoryById,
  currentBalance,
  monthExpense,
  monthIncome,
  mockTransactions,
  pendingFixed,
  pendingFixedTotal,
  projectedBalance,
} from '@/lib/mock'

export function Hoy() {
  const ultimos = mockTransactions.slice(-6).reverse()

  return (
    <div className="flex flex-col gap-12">
      {/* El hero va suelto, a ancho completo: la cifra ES la pantalla, no el contenido de una tarjeta. */}
      <header>
        <p className="eyebrow">Saldo actual · Agosto 2026</p>
        <Money cents={currentBalance} tone="acid" size="hero" className="mt-3 -ml-1" />

        <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6 border-t border-ink-850 pt-6">
          <div>
            <p className="eyebrow">Ingresos del mes</p>
            <Money cents={monthIncome} tone="chalk" size="figure" className="mt-1" />
          </div>
          <div>
            <p className="eyebrow">Gastos del mes</p>
            <Money cents={monthExpense} tone="coral" size="figure" className="mt-1" />
          </div>
          <Button
            className="w-full sm:ml-auto sm:w-auto"
            icon={<span className="text-base leading-none">+</span>}
          >
            Nuevo movimiento
          </Button>
        </div>
      </header>

      {/* Grilla asimétrica 2/3 – 1/3. Nunca tres tarjetas iguales en fila. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Últimos movimientos"
            action={
              <Link to="/movimientos" className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                Ver todos
              </Link>
            }
          />
          <ul className="pb-3">
            {ultimos.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-6">
          {/* La métrica estrella: con cuánto termina el mes una vez pagados los fijos que faltan. */}
          <Panel className="p-6 ring-1 ring-acid/15">
            <p className="eyebrow">Saldo proyectado a fin de mes</p>
            <Money cents={projectedBalance} tone="chalk" size="figure" className="mt-2" />

            <dl className="mt-5 space-y-2 border-t border-ink-800 pt-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">Saldo actual</dt>
                <dd>
                  <Money cents={currentBalance} tone="dim" />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-chalk-faint">
                  Fijos por pagar ({pendingFixed.length})
                </dt>
                <dd>
                  <Money cents={-pendingFixedTotal} tone="coral" />
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel tone="flat">
            <PanelHeader title="Fijos pendientes" hint={`${pendingFixed.length} sin abonar este mes`} />
            <ul className="px-6 pb-5">
              {pendingFixed.map((fixed) => (
                <li
                  key={fixed.id}
                  className="flex items-center gap-3 border-t border-ink-850 py-2.5 first:border-t-0"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryById.get(fixed.categoryId)?.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{fixed.name}</span>
                  <span className="tnum text-[12px] text-chalk-faint">día {fixed.dueDay}</span>
                  <Money cents={fixed.cents} tone="dim" />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
