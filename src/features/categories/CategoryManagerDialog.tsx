import { useMemo, useState } from 'react'
import { Pencil, Undo2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogBottomBar, DialogSection, type DialogStatus } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { CATEGORY_COLORS } from '@/lib/categoryColors'
import {
  useCategories,
  useCategoryUsageCounts,
  useCreateCategory,
  useSetCategoryArchived,
  useUpdateCategory,
  type Category,
  type CategoryKind,
} from '@/features/categories/api'
import { CategoryRowEditor } from '@/features/categories/CategoryRowEditor'

interface CategoryManagerDialogProps {
  open: boolean
  onClose: () => void
}

/** "Sueldo, Devoluciones y 2 más" — vista previa corta de nombres para la línea de contexto de una
 *  sección cerrada. Nunca un conteo a secas: la regla del acordeón pide nombrar el caso concreto. */
function previewNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`
}

type EditingTarget = string | 'new-expense' | 'new-income' | null

function CategoryListRow({
  category,
  usageCount,
  onEdit,
  onArchiveToggle,
}: {
  category: Category
  usageCount: number
  onEdit: () => void
  onArchiveToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 px-[15px] py-2">
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
      <button
        type="button"
        onClick={onArchiveToggle}
        aria-label={category.is_archived ? `Reactivar ${category.name}` : `Archivar ${category.name}`}
        className="shrink-0 rounded-chip p-1.5 text-fg-muted transition-colors hover:bg-fill-subtle hover:text-negative"
      >
        {category.is_archived ? <Undo2 className="size-3.5" strokeWidth={1.3} aria-hidden /> : <X className="size-3.5" strokeWidth={1.5} aria-hidden />}
      </button>
    </div>
  )
}

/**
 * Administra las categorías de la cuenta: dos secciones plegables por tipo (gasto/ingreso) más
 * Archivadas, en vez de una lista mezclada con la etiqueta del tipo repetida en cada fila
 * (arquetipo 4, 19b). El alta y la edición comparten la misma fila-editor (`CategoryRowEditor`,
 * 20c) — "+ Nueva categoría" inserta una fila vacía arriba, ya abierta, en vez del formulario fijo
 * de antes que obligaba a mirar dos lugares a la vez.
 */
export function CategoryManagerDialog({ open, onClose }: CategoryManagerDialogProps) {
  const { data: categories } = useCategories(true)
  const { data: usage } = useCategoryUsageCounts()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const setArchived = useSetCategoryArchived()

  const [openSection, setOpenSection] = useState<'gasto' | 'ingreso' | 'archivadas' | null>('gasto')
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [draftName, setDraftName] = useState('')
  const [draftKind, setDraftKind] = useState<CategoryKind>('expense')
  const [draftColor, setDraftColor] = useState<string>(CATEGORY_COLORS[0].hex)

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === 'expense' && !c.is_archived),
    [categories],
  )
  const incomeCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === 'income' && !c.is_archived),
    [categories],
  )
  const archivedCategories = useMemo(() => (categories ?? []).filter((c) => c.is_archived), [categories])

  const usageCount = (id: string) => usage?.get(id) ?? 0
  const enUsoCount = [...expenseCategories, ...incomeCategories].filter((c) => usageCount(c.id) > 0).length

  function toggleSection(section: 'gasto' | 'ingreso' | 'archivadas') {
    setOpenSection((current) => (current === section ? null : section))
  }

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
    setOpenSection(kind === 'expense' ? 'gasto' : 'ingreso')
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

  function statusFor(kindCategories: Category[]): { status: DialogStatus; context: string } {
    if (kindCategories.length === 0) return { status: 'neutral', context: 'Sin categorías cargadas' }
    const unused = kindCategories.filter((c) => usageCount(c.id) === 0)
    if (unused.length > 0) {
      return {
        status: 'warn',
        context: unused.length === 1 ? `${unused[0].name} sin usar` : `${unused.length} sin usar`,
      }
    }
    return { status: 'accent', context: previewNames(kindCategories.map((c) => c.name)) }
  }

  const gastoInfo = statusFor(expenseCategories)
  const ingresoInfo = statusFor(incomeCategories)

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Categorías"
      footerBleed
      footer={
        <DialogBottomBar
          label="En uso"
          figure={
            <span className="tnum font-display text-2xl font-bold tracking-[-0.03em] text-fg">{enUsoCount}</span>
          }
          action={
            <Button size="compact" onClick={onClose}>
              Listo
            </Button>
          }
          secondary={<span>Archivar una no borra sus movimientos.</span>}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <DialogSection
          title="De gasto"
          status={gastoInfo.status}
          context={gastoInfo.context}
          subtotal={expenseCategories.length}
          open={openSection === 'gasto'}
          onToggle={() => toggleSection('gasto')}
          footer={
            <button
              type="button"
              onClick={() => startCreate('expense')}
              className="text-[12px] font-medium text-accent hover:underline"
            >
              + Nueva categoría de gasto
            </button>
          }
        >
          <div className="flex flex-col">
            {editingTarget === 'new-expense' && renderEditorRow('expense')}
            {expenseCategories.map((c) =>
              editingTarget === c.id ? (
                <div key={c.id}>{renderEditorRow('expense', c.id)}</div>
              ) : (
                <CategoryListRow
                  key={c.id}
                  category={c}
                  usageCount={usageCount(c.id)}
                  onEdit={() => startEdit(c)}
                  onArchiveToggle={() => setArchived.mutate({ id: c.id, isArchived: true })}
                />
              ),
            )}
          </div>
        </DialogSection>

        <DialogSection
          title="De ingreso"
          status={ingresoInfo.status}
          context={ingresoInfo.context}
          subtotal={incomeCategories.length}
          open={openSection === 'ingreso'}
          onToggle={() => toggleSection('ingreso')}
          footer={
            <button
              type="button"
              onClick={() => startCreate('income')}
              className="text-[12px] font-medium text-accent hover:underline"
            >
              + Nueva categoría de ingreso
            </button>
          }
        >
          <div className="flex flex-col">
            {editingTarget === 'new-income' && renderEditorRow('income')}
            {incomeCategories.map((c) =>
              editingTarget === c.id ? (
                <div key={c.id}>{renderEditorRow('income', c.id)}</div>
              ) : (
                <CategoryListRow
                  key={c.id}
                  category={c}
                  usageCount={usageCount(c.id)}
                  onEdit={() => startEdit(c)}
                  onArchiveToggle={() => setArchived.mutate({ id: c.id, isArchived: true })}
                />
              ),
            )}
          </div>
        </DialogSection>

        {archivedCategories.length > 0 && (
          <DialogSection
            title="Archivadas"
            status="neutral"
            context="Sus movimientos siguen intactos"
            subtotal={archivedCategories.length}
            open={openSection === 'archivadas'}
            onToggle={() => toggleSection('archivadas')}
          >
            <div className="flex flex-col">
              {archivedCategories.map((c) =>
                editingTarget === c.id ? (
                  <div key={c.id}>{renderEditorRow(c.kind, c.id)}</div>
                ) : (
                  <CategoryListRow
                    key={c.id}
                    category={c}
                    usageCount={usageCount(c.id)}
                    onEdit={() => startEdit(c)}
                    onArchiveToggle={() => setArchived.mutate({ id: c.id, isArchived: false })}
                  />
                ),
              )}
            </div>
          </DialogSection>
        )}
      </div>
    </Dialog>
  )
}
