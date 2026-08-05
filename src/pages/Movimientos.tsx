import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/EmptyState'
import { TransactionRow } from '@/components/TransactionRow'
import { mockCategories, mockTransactions } from '@/lib/mock'

type Filter = 'all' | 'income' | 'expense'

export function Movimientos() {
  const [filter, setFilter] = useState<Filter>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const visible = useMemo(
    () =>
      mockTransactions.filter(
        (tx) =>
          (filter === 'all' || tx.type === filter) && (!categoryId || tx.categoryId === categoryId),
      ),
    [filter, categoryId],
  )

  // Agrupado por día: el usuario piensa en jornadas, no en una tira continua de filas.
  const byDay = useMemo(() => {
    const groups = new Map<string, typeof visible>()
    for (const tx of [...visible].reverse()) {
      const list = groups.get(tx.occurredOn) ?? []
      list.push(tx)
      groups.set(tx.occurredOn, list)
    }
    return [...groups.entries()]
  }, [visible])

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Agosto 2026</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Movimientos</h1>
        </div>
        <Button icon={<span className="text-base leading-none">+</span>}>Nuevo movimiento</Button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos
        </Chip>
        <Chip active={filter === 'income'} onClick={() => setFilter('income')}>
          Ingresos
        </Chip>
        <Chip active={filter === 'expense'} onClick={() => setFilter('expense')}>
          Gastos
        </Chip>
        <span aria-hidden className="mx-1.5 w-px bg-ink-800" />
        {mockCategories.map((category) => (
          <Chip
            key={category.id}
            color={category.color}
            active={categoryId === category.id}
            onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
          >
            {category.name}
          </Chip>
        ))}
      </div>

      {byDay.length === 0 ? (
        <Panel>
          <EmptyState
            glyph="∅"
            title="No hay movimientos con esos filtros"
            hint="Probá sacando la categoría o cambiando el tipo."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter('all')
                  setCategoryId(null)
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map(([day, items]) => {
            const total = items.reduce((acc, t) => acc + (t.type === 'income' ? t.cents : -t.cents), 0)
            return (
              <Panel key={day}>
                <div className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-1">
                  <h2 className="eyebrow">
                    {format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}
                  </h2>
                  <Money cents={total} tone={total >= 0 ? 'dim' : 'coral'} signed />
                </div>
                <ul className="pb-3">
                  {items.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))}
                </ul>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
