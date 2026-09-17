import { useMemo, useState } from 'react'
import { Archive, Pencil, Trash2, Undo2 } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/ui/Panel'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import {
  useCategories,
  useCategoryUsageCounts,
  useCreateCategory,
  useDeleteCategory,
  useSetCategoryArchived,
  useUpdateCategory,
  type Category,
  type CategoryKind,
  type CategoryUsage,
} from '@/features/categories/api'
import { CategoryRowEditor } from '@/features/categories/CategoryRowEditor'
import { ArchiveCategoryDialog, DeleteCategoryDialog } from '@/features/categories/CategoryConfirmDialogs'

type EditingTarget = string | 'new-expense' | 'new-income' | null

function CategoryListRow({
  category,
  usage,
  onEdit,
  onArchive,
  onReactivate,
  onDelete,
}: {
  category: Category
  usage: CategoryUsage | undefined
  onEdit: () => void
  onArchive: () => void
  onReactivate: () => void
  onDelete: () => void
}) {
  const usageCount = usage?.total ?? 0

  return (
    <div className="flex items-center gap-2.5 px-panel py-2.5">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-fg">{category.name}</p>
        <p className="mt-0.5 text-[11px] text-fg-muted">
          {usageCount} movimiento{usageCount === 1 ? '' : 's'}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${category.name}`}
        className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
      >
        <Pencil className="size-3.5" strokeWidth={1.3} aria-hidden />
      </button>
      {category.is_archived ? (
        <>
          <button
            type="button"
            onClick={onReactivate}
            aria-label={`Reactivar ${category.name}`}
            className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-fg"
          >
            <Undo2 className="size-3.5" strokeWidth={1.3} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Eliminar ${category.name}`}
            className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
          >
            <Trash2 className="size-3.5" strokeWidth={1.3} aria-hidden />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onArchive}
          aria-label={`Archivar ${category.name}`}
          className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
        >
          <Archive className="size-3.5" strokeWidth={1.3} aria-hidden />
        </button>
      )}
    </div>
  )
}

/**
 * Pantalla de categorías de la cuenta (`/categorias`) — antes vivía en un diálogo (`CategoryManagerDialog`,
 * ahora borrado); pasó a pantalla propia para que archivar/eliminar tengan lugar para explicarse sin
 * apretar un modal sobre otro. Se accede desde Ajustes y desde "Categorías" en Movimientos.
 *
 * Dos paneles por tipo (gasto/ingreso) más Archivadas, en vez de una lista mezclada con la etiqueta
 * del tipo repetida en cada fila (arquetipo 4, 19b). El alta y la edición comparten la misma
 * fila-editor (`CategoryRowEditor`, 20c).
 *
 * Archivar y eliminar son dos acciones distintas a propósito (ver conversación con Lean,
 * plan.md "al-eliminar-una-categoria"): archivar es reversible y no toca los registros existentes
 * (`useSetCategoryArchived`); eliminar es definitivo y sólo está disponible desde Archivadas — sus
 * movimientos/fijos/compras quedan como "Sin categoría" (`useDeleteCategory`, FKs `on delete set
 * null`). Archivar confirma sólo si hay registros asociados; eliminar confirma siempre.
 */
export function Categorias() {
  const { data: categories, isPending } = useCategories(true)
  const { data: usage } = useCategoryUsageCounts()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const setArchived = useSetCategoryArchived()
  const deleteCategory = useDeleteCategory()

  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [draftName, setDraftName] = useState('')
  const [draftKind, setDraftKind] = useState<CategoryKind>('expense')
  const [draftColor, setDraftColor] = useState<string>(CATEGORY_COLORS[0].hex)
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === 'expense' && !c.is_archived),
    [categories],
  )
  const incomeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === 'income' && !c.is_archived),
    [categories],
  )
  const archivedCategories = useMemo(() => (categories ?? []).filter((c) => c.is_archived), [categories])

  function startEdit(c: Category) {
    setEditingTarget(c.id)
    setDraftName(c.name)
    setDraftKind(c.kind)
    setDraftColor(c.color)
  }

  function startCreate(kind: CategoryKind) {
    setEditingTarget(kind === 'expense' ? 'new-expense' : 'new-income')
    setDraftName('')
    setDraftKind(kind)
    setDraftColor(CATEGORY_COLORS[0].hex)
  }

  function cancelEdit() {
    setEditingTarget(null)
  }

  async function saveEdit() {
    const trimmed = draftName.trim()
    if (!trimmed) return
    if (editingTarget === 'new-expense' || editingTarget === 'new-income') {
      await createCategory.mutateAsync({ name: trimmed, kind: draftKind, color: draftColor })
    } else if (editingTarget) {
      await updateCategory.mutateAsync({ id: editingTarget, name: trimmed, kind: draftKind, color: draftColor })
    }
    setEditingTarget(null)
  }

  const isSaving = createCategory.isPending || updateCategory.isPending

  // Sin registros asociados, archivar no tiene nada que explicar — se ahorra el modal.
  function handleArchiveClick(c: Category) {
    if ((usage?.get(c.id)?.total ?? 0) === 0) {
      setArchived.mutate({ id: c.id, isArchived: true })
    } else {
      setArchiveTarget(c)
    }
  }

  function renderEditorRow(kind: CategoryKind, categoryId?: string) {
    return (
      <CategoryRowEditor
        name={draftName}
        onNameChange={setDraftName}
        kind={draftKind}
        onKindChange={setDraftKind}
        color={draftColor}
        onColorChange={setDraftColor}
        onCancel={cancelEdit}
        onSave={saveEdit}
        saving={isSaving}
        key={categoryId ?? `new-${kind}`}
      />
    )
  }

  function renderList(kindCategories: Category[], kind: CategoryKind) {
    const newTarget = kind === 'expense' ? 'new-expense' : 'new-income'
    return (
      <div className="flex flex-col divide-y divide-fill-subtle">
        {editingTarget === newTarget && renderEditorRow(kind)}
        {kindCategories.length === 0 && editingTarget !== newTarget ? (
          <div className="px-panel pb-5">
            <EmptyState glyph="▤" title={`Sin categorías de ${kind === 'expense' ? 'gasto' : 'ingreso'}`} />
          </div>
        ) : (
          kindCategories.map((c) =>
            editingTarget === c.id ? (
              <div key={c.id}>{renderEditorRow(kind, c.id)}</div>
            ) : (
              <CategoryListRow
                key={c.id}
                category={c}
                usage={usage?.get(c.id)}
                onEdit={() => startEdit(c)}
                onArchive={() => handleArchiveClick(c)}
                onReactivate={() => setArchived.mutate({ id: c.id, isArchived: false })}
                onDelete={() => setDeleteTarget(c)}
              />
            ),
          )
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Tu cuenta</p>
        <h1 className="mt-2 font-display text-figure font-semibold">Categorías</h1>
        <p className="mt-2 max-w-md text-[13px] text-fg-muted">Archivar una no borra sus movimientos.</p>
      </header>

      {isPending ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel className="p-panel">
            <Skeleton className="h-40 w-full" />
          </Panel>
          <Panel className="p-panel">
            <Skeleton className="h-40 w-full" />
          </Panel>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="De gasto"
                action={
                  <button
                    type="button"
                    onClick={() => startCreate('expense')}
                    className="shrink-0 text-[12px] font-semibold text-accent hover:opacity-80"
                  >
                    + Nueva
                  </button>
                }
              />
              {renderList(expenseCategories, 'expense')}
            </Panel>

            <Panel>
              <PanelHeader
                title="De ingreso"
                action={
                  <button
                    type="button"
                    onClick={() => startCreate('income')}
                    className="shrink-0 text-[12px] font-semibold text-accent hover:opacity-80"
                  >
                    + Nueva
                  </button>
                }
              />
              {renderList(incomeCategories, 'income')}
            </Panel>
          </div>

          {archivedCategories.length > 0 && (
            <Panel>
              <PanelHeader title="Archivadas" hint="Sus movimientos siguen intactos" />
              <div className="flex flex-col divide-y divide-fill-subtle pb-2">
                {archivedCategories.map((c) =>
                  editingTarget === c.id ? (
                    <div key={c.id}>{renderEditorRow(c.kind, c.id)}</div>
                  ) : (
                    <CategoryListRow
                      key={c.id}
                      category={c}
                      usage={usage?.get(c.id)}
                      onEdit={() => startEdit(c)}
                      onArchive={() => handleArchiveClick(c)}
                      onReactivate={() => setArchived.mutate({ id: c.id, isArchived: false })}
                      onDelete={() => setDeleteTarget(c)}
                    />
                  ),
                )}
              </div>
            </Panel>
          )}
        </>
      )}

      {archiveTarget && (
        <ArchiveCategoryDialog
          open={!!archiveTarget}
          onClose={() => setArchiveTarget(null)}
          category={archiveTarget}
          usage={usage?.get(archiveTarget.id)}
          pending={setArchived.isPending}
          onConfirm={() => setArchived.mutate({ id: archiveTarget.id, isArchived: true }, { onSuccess: () => setArchiveTarget(null) })}
        />
      )}

      {deleteTarget && (
        <DeleteCategoryDialog
          open={!!deleteTarget}
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
