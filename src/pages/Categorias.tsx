import { useMemo, useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SearchInput } from '@/components/ui/SearchInput'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  useCategories,
  useCategoryUsageCounts,
  useCreateCategory,
  useDeleteCategory,
  useSetCategoryArchived,
  useUpdateCategory,
  type Category,
  type CategoryKind,
} from '@/features/categories/api'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { CategoryEditorDialog } from '@/features/categories/CategoryEditorDialog'
import { ArchiveCategoryDialog, DeleteCategoryDialog } from '@/features/categories/CategoryConfirmDialogs'
import { filterCategories, tabCounts, type CategoryInput, type CategoryTab } from '@/features/categories/list'

type EditorTarget = { kind: CategoryKind; category?: Category } | null

const TAB_LABELS: Record<CategoryTab, string> = { expense: 'Gasto', income: 'Ingreso', archived: 'Archivadas' }

/**
 * Pantalla de categorías de la cuenta (`/categorias`), rediseño «Pantalla C» (2026-09-26): un solo panel con pestañas Gasto · Ingreso · Archivadas
 * (con la cantidad de categorías de cada una, no de movimientos) y un buscador. Toda la fila abre el
 * editor modal (`CategoryEditorDialog`), que es donde se archiva y, desde Archivadas, se elimina.
 *
 * Archivar y eliminar son dos acciones distintas a propósito: archivar es reversible y no toca los
 * registros existentes (`useSetCategoryArchived`); eliminar es definitivo y sólo está disponible
 * para una archivada — sus movimientos/fijos/compras quedan como "Sin categoría" (`useDeleteCategory`,
 * FKs `on delete set null`). Archivar confirma sólo si hay registros asociados; eliminar, siempre.
 */
export function Categorias() {
  const { data: categories, isPending, isError, refetch } = useCategories(true)
  const { data: usage } = useCategoryUsageCounts()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const setArchived = useSetCategoryArchived()
  const deleteCategory = useDeleteCategory()

  const [tab, setTab] = useState<CategoryTab>('expense')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<EditorTarget>(null)
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const counts = useMemo(() => tabCounts(categories ?? []), [categories])
  const visible = useMemo(() => filterCategories(categories ?? [], tab, query), [categories, tab, query])

  // El tipo no se edita (HO-15): al crear sale de la pestaña activa, al editar queda fijo —
  // `useUpdateCategory` ni siquiera acepta `kind`.
  function handleSave(input: CategoryInput) {
    if (!editor) return
    const close = { onSuccess: () => setEditor(null) }
    if (editor.category) updateCategory.mutate({ id: editor.category.id, ...input }, close)
    else createCategory.mutate({ ...input, kind: editor.kind }, close)
  }

  // Sin registros asociados, archivar no tiene nada que explicar — se ahorra la confirmación.
  function handleArchive(c: Category) {
    setEditor(null)
    if ((usage?.get(c.id)?.total ?? 0) === 0) setArchived.mutate({ id: c.id, isArchived: true })
    else setArchiveTarget(c)
  }

  function handleReactivate(c: Category) {
    setArchived.mutate({ id: c.id, isArchived: false }, { onSuccess: () => setEditor(null) })
  }

  function handleDelete(c: Category) {
    setEditor(null)
    setDeleteTarget(c)
  }

  const newKind: CategoryKind | null = tab === 'archived' ? null : tab
  const newLabel = tab === 'income' ? 'Nueva de ingreso' : 'Nueva de gasto'

  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      <div className="flex items-end gap-4">
        <header className="min-w-0 flex-1">
          <p className="eyebrow">Tu cuenta</p>
          <h1 className="mt-2 font-display text-figure font-semibold">Categorías</h1>
          <p className="mt-2 max-w-[620px] text-[13.5px] text-fg-secondary max-sm:hidden">
            Archivar una no borra sus movimientos. El tipo se elige al crearla y ya no cambia.
          </p>
        </header>
        {newKind && (
          <button
            type="button"
            onClick={() => setEditor({ kind: newKind })}
            aria-label={newLabel}
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-[14px] bg-accent text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover max-sm:w-11 sm:pr-[18px] sm:pl-3.5"
          >
            <Plus className="size-5" strokeWidth={2} aria-hidden />
            <span className="max-sm:hidden">{newLabel}</span>
          </button>
        )}
      </div>

      <Panel className="flex flex-col px-3 pt-3.5 pb-1.5 sm:px-6 sm:pt-[18px] sm:pb-3">
        <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between sm:pb-2.5">
          <SegmentedToggle
            variant="tabs"
            value={tab}
            onChange={setTab}
            options={(['expense', 'income', 'archived'] as const).map((t) => ({
              value: t,
              label: (
                <>
                  {TAB_LABELS[t]}
                  <span className="tnum text-[12px] font-medium text-fg-muted">{counts[t]}</span>
                </>
              ),
            }))}
          />
          <div className="sm:w-[300px]">
            <SearchInput size="lg" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar categoría" aria-label="Buscar categoría" />
          </div>
        </div>

        {tab === 'archived' && (
          <p className="px-1.5 pt-1 pb-2 text-[13px] text-fg-secondary sm:pb-2.5">
            No se ofrecen al cargar movimientos. Sus movimientos siguen intactos.
          </p>
        )}

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="flex flex-col gap-2 py-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            glyph="▤"
            title={
              query.trim()
                ? `Nada con «${query.trim()}»`
                : tab === 'archived'
                  ? 'No hay archivadas'
                  : `Sin categorías de ${tab === 'expense' ? 'gasto' : 'ingreso'}`
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            {visible.map((c) => (
              <li key={c.id} className="flex h-14 items-center gap-3 border-b border-border">
                {c.is_archived ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditor({ kind: c.kind, category: c })}
                      className="flex h-full min-w-0 flex-1 items-center gap-3 pl-1.5 text-left"
                    >
                      <CategoryChip color={c.color} icon={c.icon} archived />
                      <span className="truncate text-[14px] text-fg-secondary">{c.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReactivate(c)}
                      disabled={setArchived.isPending}
                      className="h-9 shrink-0 rounded-control border border-border-strong px-3 text-[13px] font-semibold text-fg transition-colors hover:bg-fill-subtle disabled:opacity-50"
                    >
                      Reactivar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditor({ kind: c.kind, category: c })}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 px-1.5 text-left text-[14px] font-medium text-fg"
                  >
                    <CategoryChip color={c.color} icon={c.icon} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-fg-muted" strokeWidth={2} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editor && (
        <CategoryEditorDialog
          key={editor.category?.id ?? `new-${editor.kind}`}
          open
          onClose={() => setEditor(null)}
          kind={editor.kind}
          category={editor.category}
          saving={createCategory.isPending || updateCategory.isPending || setArchived.isPending}
          onSave={handleSave}
          onArchive={editor.category && !editor.category.is_archived ? () => handleArchive(editor.category!) : undefined}
          onReactivate={editor.category?.is_archived ? () => handleReactivate(editor.category!) : undefined}
          onDelete={editor.category?.is_archived ? () => handleDelete(editor.category!) : undefined}
        />
      )}

      {archiveTarget && (
        <ArchiveCategoryDialog
          open
          onClose={() => setArchiveTarget(null)}
          category={archiveTarget}
          usage={usage?.get(archiveTarget.id)}
          pending={setArchived.isPending}
          onConfirm={() => setArchived.mutate({ id: archiveTarget.id, isArchived: true }, { onSuccess: () => setArchiveTarget(null) })}
        />
      )}

      {deleteTarget && (
        <DeleteCategoryDialog
          open
          onClose={() => setDeleteTarget(null)}
          category={deleteTarget}
          usage={usage?.get(deleteTarget.id)}
          pending={deleteCategory.isPending}
          onConfirm={() => deleteCategory.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        />
      )}
    </div>
  )
}
