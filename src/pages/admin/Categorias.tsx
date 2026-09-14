import { useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { GripVertical, Pencil } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ColorPicker } from '@/components/ui/ColorPicker'
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

type EditingTarget = string | null

function CategoryRow({
  category,
  isEditing,
  draftName,
  draftKind,
  draftColor,
  onDraftNameChange,
  onDraftKindChange,
  onDraftColorChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  saving,
  onDragEnd,
}: {
  category: DefaultCategory
  isEditing: boolean
  draftName: string
  draftKind: DefaultCategoryKind
  draftColor: string
  onDraftNameChange: (v: string) => void
  onDraftKindChange: (k: DefaultCategoryKind) => void
  onDraftColorChange: (c: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  saving: boolean
  onDragEnd: () => void
}) {
  const updateCategory = useUpdateDefaultCategory()
  const dragControls = useDragControls()

  if (isEditing) {
    return (
      <Reorder.Item value={category} dragListener={false} className="bg-surface">
        <div className="flex items-center gap-3 border-l-2 border-accent bg-editing px-panel py-2.5">
          <span aria-hidden className="shrink-0 p-1 text-fg-muted opacity-30">
            <GripVertical className="size-4" fill="currentColor" />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <input
              value={draftName}
              onChange={(e) => onDraftNameChange(e.target.value)}
              placeholder="Mascotas, Regalos…"
              autoFocus
              className="h-9 min-w-0 flex-1 rounded-control border border-accent/30 bg-surface px-2.5 text-[13.5px] text-fg outline-none"
            />
            <div className="flex shrink-0 gap-1">
              <Chip active={draftKind === 'expense'} onClick={() => onDraftKindChange('expense')}>
                Gasto
              </Chip>
              <Chip active={draftKind === 'income'} onClick={() => onDraftKindChange('income')}>
                Ingreso
              </Chip>
            </div>
            <ColorPicker value={draftColor} onChange={onDraftColorChange} />
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex h-7 items-center rounded-chip px-3 text-[12px] font-semibold text-fg-secondary transition-colors hover:bg-fill-subtle"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={!draftName.trim() || saving}
              className="flex h-7 items-center rounded-chip bg-accent px-3 text-[12px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </Reorder.Item>
    )
  }

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className={cn('flex items-center gap-3 bg-surface px-panel py-3', category.is_archived && 'opacity-50')}
    >
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        aria-label={`Reordenar ${category.name}`}
        className="shrink-0 touch-none cursor-grab p-1 text-fg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" fill="currentColor" aria-hidden />
      </button>

      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-fg">{category.name}</p>
        <p className="text-[12px] text-fg-muted">
          {category.kind === 'income' ? 'Ingreso' : 'Gasto'}
          {category.is_archived && ' · archivada'}
        </p>
      </div>
      <button
        type="button"
        onClick={onStartEdit}
        aria-label={`Editar ${category.name}`}
        className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
      >
        <Pencil className="size-4" strokeWidth={1.3} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => updateCategory.mutate({ id: category.id, isArchived: !category.is_archived })}
        disabled={updateCategory.isPending}
        className="rounded-chip px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
      >
        {category.is_archived ? 'Reactivar' : 'Archivar'}
      </button>
    </Reorder.Item>
  )
}

/** Alta en una sola línea (chips de tipo + nombre + los 8 swatches + "Agregar"), a diferencia de la
 *  edición de una fila existente (`CategoryRow` en modo editor) — son dos formas distintas a
 *  propósito: acá siempre se agrega al final, ahí se está decidiendo contra las categorías vecinas. */
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
    <div className="border-t border-fill-subtle p-panel">
      <p className="eyebrow">Agregar categoría</p>
      <p className="mt-1.5 text-[12px] text-fg-muted">Se suma al final — el orden después se arrastra.</p>
      <div className="mt-3.5 flex flex-wrap items-end gap-3.5">
        <div className="flex shrink-0 gap-1.5">
          <Chip size="lg" active={kind === 'expense'} onClick={() => setKind('expense')}>
            Gasto
          </Chip>
          <Chip size="lg" active={kind === 'income'} onClick={() => setKind('income')}>
            Ingreso
          </Chip>
        </div>

        <Field label="Nombre" className="min-w-[200px] max-w-[300px] flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mascotas, Regalos…" />
        </Field>

        <ColorPicker value={color} onChange={setColor} className="shrink-0 pb-2.5" />

        <Button variant="outline" onClick={handleAdd} disabled={!name.trim() || createCategory.isPending} className="shrink-0">
          {createCategory.isPending ? 'Agregando…' : 'Agregar'}
        </Button>
      </div>
    </div>
  )
}

function CategoryList({ categories }: { categories: DefaultCategory[] }) {
  const [order, setOrder] = useState(categories)
  const orderRef = useRef(order)
  const reorder = useReorderDefaultCategories()
  const updateCategory = useUpdateDefaultCategory()

  const [editingId, setEditingId] = useState<EditingTarget>(null)
  const [draftName, setDraftName] = useState('')
  const [draftKind, setDraftKind] = useState<DefaultCategoryKind>('expense')
  const [draftColor, setDraftColor] = useState('')

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
    reorder.mutate(orderRef.current.map((c) => c.id))
  }

  function startEdit(c: DefaultCategory) {
    setEditingId(c.id)
    setDraftName(c.name)
    setDraftKind(c.kind)
    setDraftColor(c.color)
  }

  async function saveEdit() {
    const trimmed = draftName.trim()
    if (!trimmed || !editingId) return
    await updateCategory.mutateAsync({ id: editingId, name: trimmed, kind: draftKind, color: draftColor })
    setEditingId(null)
  }

  return (
    <>
      <Reorder.Group axis="y" values={order} onReorder={handleReorder} className="divide-y divide-fill-subtle">
        {order.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            isEditing={editingId === c.id}
            draftName={draftName}
            draftKind={draftKind}
            draftColor={draftColor}
            onDraftNameChange={setDraftName}
            onDraftKindChange={setDraftKind}
            onDraftColorChange={setDraftColor}
            onStartEdit={() => startEdit(c)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={saveEdit}
            saving={updateCategory.isPending}
            onDragEnd={handleDragEnd}
          />
        ))}
      </Reorder.Group>

      <AddCategoryForm nextSortOrder={order.length} />
    </>
  )
}

export function Categorias() {
  const { data: categories, isPending, isError, refetch } = useDefaultCategories(true)
  const archivedCount = (categories ?? []).filter((c) => c.is_archived).length

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Administración</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Categorías por defecto</h1>
        <p className="mt-2 max-w-md text-[13px] text-fg-muted">
          Lo que arranca sembrado cada cuenta nueva al redimir su invitación. No afecta a las categorías que ya tiene cargadas cada cuenta. Arrastrá
          para cambiar el orden.
        </p>
      </header>

      <Panel>
        <PanelHeader
          title="Catálogo"
          action={
            categories && categories.length > 0 ? (
              <span className="text-[11.5px] text-fg-muted">
                {categories.length} categorías{archivedCount > 0 && ` · ${archivedCount} archivada${archivedCount === 1 ? '' : 's'}`}
              </span>
            ) : undefined
          }
        />

        {isError ? (
          <div className="px-panel pb-5">
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-1 px-panel pb-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !categories || categories.length === 0 ? (
          <>
            <div className="px-panel pb-5">
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
