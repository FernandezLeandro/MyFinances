import { useEffect, useRef, useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { ChevronRight, GripVertical, Plus } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { CategoryEditorDialog } from '@/features/categories/CategoryEditorDialog'
import type { CategoryInput } from '@/features/categories/list'
import {
  useCreateDefaultCategory,
  useDefaultCategories,
  useReorderDefaultCategories,
  useUpdateDefaultCategory,
  type DefaultCategory,
  type DefaultCategoryKind,
} from '@/features/default-categories/api'

type EditorTarget = { kind: DefaultCategoryKind; category?: DefaultCategory } | null

function CategoryRow({
  category,
  onEdit,
  onDragEnd,
}: {
  category: DefaultCategory
  onEdit: () => void
  onDragEnd: () => void
}) {
  const dragControls = useDragControls()

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2 bg-surface px-panel py-2.5"
    >
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        aria-label={`Reordenar ${category.name}`}
        className="shrink-0 touch-none cursor-grab p-1 text-fg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" fill="currentColor" aria-hidden />
      </button>

      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <CategoryChip color={category.color} icon={category.icon} archived={category.is_archived} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[14px]', category.is_archived ? 'text-fg-secondary' : 'text-fg')}>{category.name}</span>
          <span className="block text-[12px] text-fg-muted">
            {category.kind === 'income' ? 'Ingreso' : 'Gasto'}
            {category.is_archived && ' · archivada'}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-fg-muted" strokeWidth={2} aria-hidden />
      </button>
    </Reorder.Item>
  )
}

/**
 * Catálogo de categorías por defecto. Mismo editor modal que `/categorias`
 * (`CategoryEditorDialog`): el tipo se elige con el botón de alta («Nueva de gasto / de ingreso») y
 * queda fijo (HO-15); archivar y reactivar van en el pie del editor. Acá no hay eliminar — archivar
 * alcanza para que deje de sembrarse. La lista se reordena arrastrando.
 */
export function Categorias() {
  const { data: categories, isPending, isError, refetch } = useDefaultCategories(true)
  const createCategory = useCreateDefaultCategory()
  const updateCategory = useUpdateDefaultCategory()
  const reorder = useReorderDefaultCategories()

  const [order, setOrder] = useState<DefaultCategory[]>([])
  const orderRef = useRef(order)
  const [editor, setEditor] = useState<EditorTarget>(null)

  // Resincroniza cuando cambian los datos del server (alta, archivado, o el propio reorder ya
  // confirmado) — como siempre mandamos sort_order secuencial sin empates, el refetch vuelve en el
  // mismo orden que se ve en pantalla, sin salto visual.
  useEffect(() => setOrder(categories ?? []), [categories])

  // `onReorder` sólo reacomoda en pantalla mientras se arrastra — dispara en cada cruce con otra
  // fila, así que guardar ahí prendería el overlay de "Guardando" de golpe en golpe. Se persiste
  // recién en `onDragEnd` (una vez al soltar), leyendo el ref porque el handler de esa fila se
  // define en el render en que empezó el drag y no se refresca en cada reacomodo intermedio.
  function handleReorder(newOrder: DefaultCategory[]) {
    orderRef.current = newOrder
    setOrder(newOrder)
  }

  function handleSave(input: CategoryInput) {
    if (!editor) return
    const close = { onSuccess: () => setEditor(null) }
    if (editor.category) updateCategory.mutate({ id: editor.category.id, ...input }, close)
    else createCategory.mutate({ ...input, kind: editor.kind, sortOrder: order.length }, close)
  }

  function setArchived(c: DefaultCategory, isArchived: boolean) {
    updateCategory.mutate({ id: c.id, isArchived }, { onSuccess: () => setEditor(null) })
  }

  const archivedCount = order.filter((c) => c.is_archived).length

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
          hint={
            order.length > 0
              ? `${order.length} categorías${archivedCount > 0 ? ` · ${archivedCount} archivada${archivedCount === 1 ? '' : 's'}` : ''}`
              : undefined
          }
          action={
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <Button variant="outline" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditor({ kind: 'expense' })}>
                De gasto
              </Button>
              <Button variant="outline" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditor({ kind: 'income' })}>
                De ingreso
              </Button>
            </div>
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
        ) : order.length === 0 ? (
          <div className="px-panel pb-5">
            <EmptyState glyph="▤" title="Todavía no hay categorías por defecto" />
          </div>
        ) : (
          <Reorder.Group axis="y" values={order} onReorder={handleReorder} className="divide-y divide-fill-subtle pb-2">
            {order.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onEdit={() => setEditor({ kind: c.kind, category: c })}
                onDragEnd={() => reorder.mutate(orderRef.current.map((x) => x.id))}
              />
            ))}
          </Reorder.Group>
        )}
      </Panel>

      {editor && (
        <CategoryEditorDialog
          key={editor.category?.id ?? `new-${editor.kind}`}
          open
          onClose={() => setEditor(null)}
          kind={editor.kind}
          category={editor.category}
          saving={createCategory.isPending || updateCategory.isPending}
          onSave={handleSave}
          onArchive={editor.category && !editor.category.is_archived ? () => setArchived(editor.category!, true) : undefined}
          onReactivate={editor.category?.is_archived ? () => setArchived(editor.category!, false) : undefined}
        />
      )}
    </div>
  )
}
