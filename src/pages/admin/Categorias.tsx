import { useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'
import {
  useCreateDefaultCategory,
  useDefaultCategories,
  useUpdateDefaultCategory,
  type DefaultCategory,
  type DefaultCategoryKind,
} from '@/features/default-categories/api'

function CategoryRow({ category }: { category: DefaultCategory }) {
  const updateCategory = useUpdateDefaultCategory()

  return (
    <li className={cn('flex items-center gap-3 px-6 py-3', category.is_archived && 'opacity-50')}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-chalk">{category.name}</p>
        <p className="text-[12px] text-chalk-faint">
          {category.kind === 'income' ? 'Ingreso' : 'Gasto'} · orden {category.sort_order}
          {category.is_archived && ' · archivada'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => updateCategory.mutate({ id: category.id, isArchived: !category.is_archived })}
        disabled={updateCategory.isPending}
        className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
      >
        {category.is_archived ? 'Reactivar' : 'Archivar'}
      </button>
    </li>
  )
}

function AddCategoryForm() {
  const createCategory = useCreateDefaultCategory()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DefaultCategoryKind>('expense')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].hex)
  const [sortOrder, setSortOrder] = useState('99')

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createCategory.mutateAsync({ name: trimmed, kind, color, sortOrder: Number(sortOrder) || 99 })
    setName('')
    setColor(CATEGORY_COLORS[0].hex)
    setSortOrder('99')
  }

  return (
    <div className="border-t border-ink-800 p-6">
      <p className="eyebrow">Agregar categoría</p>
      <p className="mt-1.5 text-[12px] text-chalk-faint">Se suma a lo que arranca sembrado en cada cuenta nueva.</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Chip active={kind === 'expense'} onClick={() => setKind('expense')}>
            Gasto
          </Chip>
          <Chip active={kind === 'income'} onClick={() => setKind('income')}>
            Ingreso
          </Chip>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mascotas, Regalos…" />
          </Field>
          <Field label="Orden">
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => setColor(c.hex)}
              aria-label={`Color ${c.name}`}
              aria-pressed={color === c.hex}
              className={cn(
                'size-6 rounded-full transition-transform duration-150',
                color === c.hex && 'ring-2 ring-chalk ring-offset-2 ring-offset-ink-900',
              )}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        <Button variant="outline" onClick={handleAdd} disabled={!name.trim() || createCategory.isPending} className="self-start">
          {createCategory.isPending ? 'Agregando…' : 'Agregar categoría'}
        </Button>
      </div>
    </div>
  )
}

export function Categorias() {
  const { data: categories, isPending, isError, refetch } = useDefaultCategories(true)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Categorías por defecto</h1>
        <p className="mt-2 max-w-md text-[13px] text-chalk-faint">
          Lo que arranca sembrado cada cuenta nueva al redimir su invitación. No afecta a las categorías que ya tiene cargadas cada cuenta.
        </p>
      </header>

      <Panel>
        <PanelHeader title="Catálogo" />

        {isError ? (
          <div className="px-6 pb-5">
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-1 px-6 pb-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !categories || categories.length === 0 ? (
          <div className="px-6 pb-5">
            <EmptyState glyph="▤" title="Todavía no hay categorías por defecto" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-850">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}

        <AddCategoryForm />
      </Panel>
    </div>
  )
}
