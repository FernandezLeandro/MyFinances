import { useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Dialog } from '@/components/ui/Dialog'
import { cn } from '@/lib/cn'
import {
  categoryById,
  mockCategories,
  mockFixedExpenses,
  pendingFixedTotal,
  projectedBalance,
} from '@/lib/mock'

const HOY = 5 // Bloque 0: día fijo del mock. En el Bloque 3 sale de la fecha real.

export function Fijos() {
  const [open, setOpen] = useState(false)
  const ordenados = [...mockFixedExpenses].sort((a, b) => a.dueDay - b.dueDay)
  const total = mockFixedExpenses.reduce((acc, f) => acc + f.cents, 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Agosto 2026</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Gastos fijos</h1>
        </div>
        <Button onClick={() => setOpen(true)} icon={<span className="text-base leading-none">+</span>}>
          Nuevo fijo
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Del mes" hint="Ordenados por día de vencimiento" />
          <ul className="pb-3">
            {ordenados.map((fixed) => {
              const vencido = !fixed.paid && fixed.dueDay < HOY
              return (
                <li
                  key={fixed.id}
                  className="flex items-center gap-3 px-6 py-3.5 transition-colors duration-150 hover:bg-ink-850"
                >
                  <button
                    type="button"
                    aria-pressed={fixed.paid}
                    aria-label={fixed.paid ? `${fixed.name}: pagado` : `${fixed.name}: marcar como pagado`}
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-chip transition-colors duration-150',
                      fixed.paid ? 'bg-acid text-ink-950' : 'bg-ink-800 text-transparent hover:bg-ink-700',
                    )}
                  >
                    <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                      <path
                        d="M2.5 6.2 5 8.6l4.5-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryById.get(fixed.categoryId)?.color }}
                  />

                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[14px]', fixed.paid ? 'text-chalk-faint' : 'text-chalk')}>
                      {fixed.name}
                    </p>
                    <p className="mt-0.5 text-[12px]">
                      <span className={vencido ? 'text-coral' : 'text-chalk-faint'}>
                        {vencido ? `Venció el ${fixed.dueDay}` : `Vence el ${fixed.dueDay}`}
                      </span>
                    </p>
                  </div>

                  <Money cents={fixed.cents} tone={fixed.paid ? 'dim' : 'chalk'} />
                </li>
              )
            })}
          </ul>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel className="p-6 ring-1 ring-acid/15">
            <p className="eyebrow">Saldo proyectado a fin de mes</p>
            <Money cents={projectedBalance} tone="chalk" size="figure" className="mt-2" />
            <p className="mt-4 border-t border-ink-800 pt-4 text-[13px] text-chalk-faint">
              Descontando <Money cents={pendingFixedTotal} tone="coral" /> de fijos que todavía no pagaste.
            </p>
          </Panel>

          <Panel tone="flat" className="p-6">
            <p className="eyebrow">Total de fijos del mes</p>
            <Money cents={total} tone="dim" size="figure" className="mt-2" />
          </Panel>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo gasto fijo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setOpen(false)}>Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Importe">
            <AmountInput />
          </Field>
          <Field label="Nombre">
            <Input placeholder="Internet, prepaga, alquiler…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría">
              <Select defaultValue="servicios">
                {mockCategories
                  .filter((c) => c.kind === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Día de vencimiento" hint="1 a 31">
              <Input type="number" min={1} max={31} defaultValue={10} />
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
