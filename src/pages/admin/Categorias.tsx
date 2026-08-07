import { useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import { cn } from '@/lib/cn'
import {
  useCreateDefaultCategory,
  useDefaultCategories,
  useReorderDefaultCategories,
  useUpdateDefaultCategory,
  type DefaultCategory,
  type DefaultCategoryKind,
} from '@/features/default-categories/api'

function CategoryEditDialog({ category, onClose }: { category: DefaultCategory; onClose: () => void }) {
  const updateCategory = useUpdateDefaultCategory()
  const [name, setName] = useState(category.name)
  const [kind, setKind] = useState<DefaultCategoryKind>(category.kind)
  const [color, setColor] = useState(category.color)

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    await updateCategory.mutateAsync({ id: category.id, name: trimmed, kind, color })
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar categoría"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim() || updateCategory.isPending}>
            {updateCategory.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Chip active={kind === 'expense'} onClick={() => setKind('expense')}>
            Gasto
          </Chip>
          <Chip active={kind === 'income'} onClick={() => setKind('income')}>
            Ingreso
          </Chip>
        </div>

        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

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
      </div>
    </Dialog>
  )
}

function CategoryRow({
  category,
  onEdit,
  onDragEnd,
}: {
  category: DefaultCategory
  onEdit: (c: DefaultCategory) => void
  onDragEnd: () => void
}) {
  const updateCategory = useUpdateDefaultCategory()
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className={cn('flex items-center gap-3 bg-ink-900 px-6 py-3', category.is_archived && 'opacity-50')}
    >
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        aria-label={`Reordenar ${category.name}`}
        className="shrink-0 touch-none cursor-grab p-1 text-chalk-faint active:cursor-grabbing"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <circle cx="5" cy="4" r="1" fill="currentColor" />
          <circle cx="5" cy="8" r="1" fill="currentColor" />
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="11" cy="4" r="1" fill="currentColor" />
          <circle cx="11" cy="8" r="1" fill="currentColor" />
          <circle cx="11" cy="12" r="1" fill="currentColor" />
        </svg>
      </button>

      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-chalk">{category.name}</p>
        <p className="text-[12px] text-chalk-faint">
          {category.kind === 'income' ? 'Ingreso' : 'Gasto'}
          {category.is_archived && ' · archivada'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(category)}
        aria-label={`Editar ${category.name}`}
        className="shrink-0 rounded-chip p-1.5 text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d="M11 2.5 13.5 5 6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => updateCategory.mutate({ id: category.id, isArchived: !category.is_archived })}
        disabled={updateCategory.isPending}
        className="rounded-chip px-2 py-1 text-[11px] text-chalk-faint transition-colors hover:bg-ink-800 hover:text-chalk"
      >
        {category.is_archived ? 'Reactivar' : 'Archivar'}
      </button>
    </Reorder.Item>
  )
}

function AddCategoryForm({ nextSortOrder }: { nextSortOrder: number }) {
  const createCategory = useCreateDefaultCategory()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<DefaultCategoryKind>('expense')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0].hex)

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    await createCategory.mutateAsync({ name: trimmed, kind, color, sortOrder: nextSortOrder })
    setName('')
    setColor(CATEGORY_COLORS[0].hex)
  }

  return (
    <div className="border-t border-ink-800 p-6">
      <p className="eyebrow">Agregar categoría</p>
      <p className="mt-1.5 text-[12px] text-chalk-faint">Se suma al final — el orden después se arrastra.</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Chip active={kind === 'expense'} onClick={() => setKind('expense')}>
            Gasto
          </Chip>
          <Chip active={kind === 'income'} onClick={() => setKind('income')}>
            Ingreso
          </Chip>
        </div>

        <Field label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mascotas, Regalos…" />
        </Field>

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

function CategoryList({ categories }: { categories: DefaultCategory[] }) {
  const [order, setOrder] = useState(categories)
  const orderRef = useRef(order)
  const reorder = useReorderDefaultCategories()
  const [editingCategory, setEditingCategory] = useState<DefaultCategory | null>(null)

  // Resincroniza cuando cambian los datos del server (alta, archivado, o el propio reorder ya
  // confirmado) — como siempre mandamos sort_order secuencial sin empates, el refetch vuelve en el
  // mismo orden que se ve en pantalla, sin salto visual.
  useEffect(() => setOrder(categories), [categories])

  // `onReorder` sólo reacomoda en pantalla mientras se arrastra — dispara en cada cruce con otra
  // fila, así que guardar ahí prendería el overlay de "Guardando" de golpe en golpe. Se persiste
  // recién en `onDragEnd` (una vez al soltar), leyendo el ref porque el handler de esa fila se
  // define en el render en que empezó el drag y no se refresca en cada reacomodo intermedio.
  function handleReorder(newOrder: DefaultCategory[]) {
    orderRef.current = newOrder
    setOrder(newOrder)
  }

  function handleDragEnd() {
    reorder.mutate(orderRef.current.map((c, i) => ({ id: c.id, sortOrder: i })))
  }

  return (
    <>
      <Reorder.Group axis="y" values={order} onReorder={handleReorder} className="divide-y divide-ink-850">
        {order.map((c) => (
          <CategoryRow key={c.id} category={c} onEdit={setEditingCategory} onDragEnd={handleDragEnd} />
        ))}
      </Reorder.Group>

      <AddCategoryForm nextSortOrder={order.length} />

      {editingCategory && <CategoryEditDialog category={editingCategory} onClose={() => setEditingCategory(null)} />}
    </>
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
          Lo que arranca sembrado cada cuenta nueva al redimir su invitación. No afecta a las categorías que ya tiene cargadas cada cuenta. Arrastrá
          para cambiar el orden.
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
          <>
            <div className="px-6 pb-5">
              <EmptyState glyph="▤" title="Todavía no hay categorías por defecto" />
            </div>
            <AddCategoryForm nextSortOrder={0} />
          </>
        ) : (
          <CategoryList categories={categories} />
        )}
      </Panel>
    </div>
  )
}
