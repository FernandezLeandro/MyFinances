import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Calendar, Check, CircleDashed, Search, Tag, Wallet } from 'lucide-react'
import { m } from 'motion/react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FieldButton } from '@/components/ui/FieldButton'
import { FloatingPanel, InDialogSheet } from '@/components/ui/FloatingPanel'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { cn } from '@/lib/cn'
import { EASE_OUT_QUINT } from '@/lib/motion'
import { useCycleConfig } from '@/lib/useCycle'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { CategoryChip } from '@/features/categories/CategoryChip'
import { chipLook } from '@/features/categories/chip'
import { UNCATEGORIZED_ID, type Category } from '@/features/categories/api'
import { UNASSIGNED_ACCOUNT_ID, type TransactionType } from '@/features/transactions/api'
import type { BalanceLocation } from '@/features/accounts/api'
import { accountKindIcon } from '@/features/accounts/accountKind'
import {
  MOVEMENT_PERIOD_PRESETS,
  MOVEMENT_PERIOD_PRESET_LABELS,
  periodRange,
  periodRangeLabel,
  type MovementPeriod,
  type MovementPeriodPreset,
} from '@/features/transactions/movementPeriod'
import { selectionLabel } from '@/features/transactions/formHelpers'

export interface MovementFilters {
  period: MovementPeriod
  type: 'all' | TransactionType
  categoryIds: string[]
  accountIds: string[]
}

interface TransactionFiltersDialogProps {
  open: boolean
  onClose: () => void
  value: MovementFilters
  onApply: (next: MovementFilters) => void
  categories: Category[]
  /** Corto a propósito (efectivo, un par de billeteras, un banco) — por eso un desplegable sin
   *  buscador, no un subpanel con búsqueda como el de categorías. */
  accounts: BalanceLocation[]
}

type FilterView = 'filters' | 'categories'

export function TransactionFiltersDialog({
  open,
  onClose,
  value,
  onApply,
  categories,
  accounts,
}: TransactionFiltersDialogProps) {
  const [draft, setDraft] = useState(value)
  const [view, setView] = useState<FilterView>('filters')
  const [categorySearch, setCategorySearch] = useState('')
  const [periodOpen, setPeriodOpen] = useState(false)
  const periodTriggerRef = useRef<HTMLButtonElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountTriggerRef = useRef<HTMLButtonElement>(null)
  const isWide = useMediaQuery('(min-width: 640px)')
  const cycleConfig = useCycleConfig()

  // El panel edita un borrador propio y sólo lo publica en "Aplicar" — así elegir varias
  // categorías no dispara una query a Supabase por cada click. Se resincroniza cada vez que abre.
  useEffect(() => {
    if (open) {
      setDraft(value)
      setView('filters')
      setCategorySearch('')
    }
  }, [open, value])

  const customInvalid =
    draft.period.preset === 'custom' && (!draft.period.from || !draft.period.to || draft.period.from > draft.period.to)

  function selectPreset(preset: MovementPeriodPreset) {
    setDraft((d) => ({ ...d, period: { ...d.period, preset } }))
    setPeriodOpen(false)
    periodTriggerRef.current?.focus()
  }

  function selectType(type: 'all' | TransactionType) {
    if (type === draft.type) return
    setDraft((d) => ({
      ...d,
      type,
      // Las categorías elegidas que ya no correspondan al tipo nuevo dejan de tener sentido —
      // `UNCATEGORIZED_ID` es la excepción: no tiene `kind` propio, así que aplica a los dos tipos
      // por igual y sobrevive cualquier cambio de pestaña.
      categoryIds:
        type === 'all'
          ? d.categoryIds
          : d.categoryIds.filter((id) => id === UNCATEGORIZED_ID || categories.find((c) => c.id === id)?.kind === type),
    }))
  }

  function toggleCategory(id: string) {
    setDraft((d) => ({
      ...d,
      categoryIds: d.categoryIds.includes(id) ? d.categoryIds.filter((c) => c !== id) : [...d.categoryIds, id],
    }))
  }

  function toggleAccount(id: string) {
    setDraft((d) => ({
      ...d,
      accountIds: d.accountIds.includes(id) ? d.accountIds.filter((a) => a !== id) : [...d.accountIds, id],
    }))
  }

  function clearDraft() {
    setDraft({ period: { ...draft.period, preset: 'month' }, type: 'all', categoryIds: [], accountIds: [] })
  }

  function clearCategories() {
    setDraft((d) => ({ ...d, categoryIds: [] }))
  }

  function apply() {
    if (customInvalid) return
    onApply(draft)
    onClose()
  }

  function openCategories() {
    setCategorySearch('')
    setView('categories')
  }

  const selectedIds = new Set(draft.categoryIds)
  // Conserva visibles las categorías archivadas ya elegidas (pueden llegar desde el drill-down de
  // Análisis) — si no, quedaría un filtro activo que el panel no puede mostrar ni sacar.
  const visibleCategories = categories.filter((c) => !c.is_archived || selectedIds.has(c.id))

  const term = categorySearch.trim().toLowerCase()
  function categoriesFor(kind: 'income' | 'expense') {
    return visibleCategories.filter((c) => c.kind === kind && (term === '' || c.name.toLowerCase().includes(term)))
  }

  // Nombres de lo elegido, para el texto de los campos Categorías y Cuenta (`selectionLabel`).
  const selectedCategoryNames = draft.categoryIds.map((id) =>
    id === UNCATEGORIZED_ID ? 'Sin categoría' : (categories.find((c) => c.id === id)?.name ?? 'Categoría'),
  )
  const selectedAccountNames = draft.accountIds.map((id) =>
    id === UNASSIGNED_ACCOUNT_ID ? 'Sin cuenta' : accounts.find((a) => a.id === id)?.name || '(sin nombre)',
  )

  const groups: { title?: string; items: Category[] }[] =
    draft.type === 'all'
      ? [
          { title: 'Gastos', items: categoriesFor('expense') },
          { title: 'Ingresos', items: categoriesFor('income') },
        ]
      : [{ items: categoriesFor(draft.type) }]
  const noResults = groups.every((g) => g.items.length === 0)

  const { from: periodFrom, to: periodTo } = periodRange(draft.period, cycleConfig)
  const periodValueLabel =
    draft.period.preset === 'custom' && (!draft.period.from || !draft.period.to) ? undefined : periodRangeLabel(periodFrom, periodTo)
  const periodList = (
    <ul role="listbox" aria-label="Período" className={cn('flex flex-col gap-0.5', isWide && 'overflow-y-auto p-1.5')}>
      {MOVEMENT_PERIOD_PRESETS.map((preset) => {
        const isSelected = draft.period.preset === preset
        const { from, to } = periodRange({ ...draft.period, preset }, cycleConfig)
        return (
          <li key={preset} role="option" aria-selected={isSelected}>
            <button
              type="button"
              onClick={() => selectPreset(preset)}
              className={cn(
                'flex h-[52px] w-full items-center gap-2.5 rounded-item px-2.5 text-left text-fg',
                isSelected ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
              )}
            >
              <span className="flex-1 text-[14px] font-semibold">{MOVEMENT_PERIOD_PRESET_LABELS[preset]}</span>
              {preset !== 'custom' && <span className="text-[12.5px] text-fg-secondary">{periodRangeLabel(from, to)}</span>}
              <Check className={cn('size-4 shrink-0', !isSelected && 'invisible')} strokeWidth={2.6} aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
  // Selección múltiple: el panel queda abierto mientras se tilda, se cierra tocando afuera o con Escape.
  const accountList = (
    <ul aria-label="Cuenta" className={cn('flex flex-col', isWide && 'overflow-y-auto px-3 py-1')}>
      <CheckRow
        leading={<AccountGlyph icon={<CircleDashed className="size-4" strokeWidth={1.8} aria-hidden />} />}
        name="Sin cuenta"
        checked={draft.accountIds.includes(UNASSIGNED_ACCOUNT_ID)}
        onToggle={() => toggleAccount(UNASSIGNED_ACCOUNT_ID)}
      />
      {accounts.map((a) => {
        const Icon = accountKindIcon(a.kind)
        return (
          <CheckRow
            key={a.id}
            leading={<AccountGlyph icon={<Icon className="size-4" strokeWidth={1.8} aria-hidden />} />}
            name={a.name || '(sin nombre)'}
            checked={draft.accountIds.includes(a.id)}
            onToggle={() => toggleAccount(a.id)}
          />
        )
      })}
    </ul>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={view === 'categories' ? 'Categorías' : 'Filtros'}
      onBack={view === 'categories' ? () => setView('filters') : undefined}
      footerBleed
      footer={
        view === 'filters' ? (
          <div className="flex w-full items-center gap-2.5 border-t border-border bg-surface px-panel pt-[14px] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" size="dialogFooter" onClick={clearDraft}>
              Limpiar
            </Button>
            <Button size="dialogFooter" className="flex-1" onClick={apply} disabled={customInvalid}>
              Aplicar
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-4 border-t border-border bg-surface px-panel pt-[14px] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={clearCategories}
              className="text-[12.5px] font-semibold text-fg-secondary transition-colors hover:text-fg"
            >
              Limpiar
            </button>
            <Button size="compact" className="ml-auto" onClick={() => setView('filters')}>
              {draft.categoryIds.length > 0 ? `Listo · ${draft.categoryIds.length}` : 'Listo'}
            </Button>
          </div>
        )
      }
    >
      {/* Entrar a Categorías desliza el contenido desde la derecha y volver, desde la izquierda —
          sólo la entrada (180ms): una salida antes de la entrada duplicaría la espera. */}
      <m.div
        key={view}
        initial={{ opacity: 0, transform: `translateX(${view === 'categories' ? 12 : -12}px)` }}
        animate={{ opacity: 1, transform: 'translateX(0px)' }}
        transition={{ duration: 0.18, ease: EASE_OUT_QUINT }}
      >
        {view === 'filters' ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Período</p>
              <FieldButton
                ref={periodTriggerRef}
                open={periodOpen}
                onClick={() => setPeriodOpen((v) => !v)}
                icon={<Calendar className="size-[18px]" strokeWidth={1.8} aria-hidden />}
                label={MOVEMENT_PERIOD_PRESET_LABELS[draft.period.preset]}
                value={periodValueLabel}
              />
              {isWide ? (
                <FloatingPanel open={periodOpen} onClose={() => setPeriodOpen(false)} triggerRef={periodTriggerRef}>
                  {periodList}
                </FloatingPanel>
              ) : (
                <InDialogSheet open={periodOpen} onClose={() => setPeriodOpen(false)} triggerRef={periodTriggerRef} title="Período">
                  {periodList}
                </InDialogSheet>
              )}
              {draft.period.preset === 'custom' && (
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="date"
                    value={draft.period.from}
                    onChange={(e) => setDraft((d) => ({ ...d, period: { ...d.period, from: e.target.value } }))}
                    className="h-9 text-[13px]"
                  />
                  <span aria-hidden className="text-fg-muted">
                    –
                  </span>
                  <Input
                    type="date"
                    value={draft.period.to}
                    onChange={(e) => setDraft((d) => ({ ...d, period: { ...d.period, to: e.target.value } }))}
                    className="h-9 text-[13px]"
                  />
                </div>
              )}
              {customInvalid && <p className="text-[12px] text-negative">Elegí un rango de fechas válido.</p>}
            </div>

            <div className="flex flex-col gap-2">
              <p className="eyebrow">Tipo</p>
              <SegmentedToggle
                variant="tabs"
                fill
                value={draft.type}
                onChange={selectType}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'expense', label: 'Gastos' },
                  { value: 'income', label: 'Ingresos' },
                ]}
              />
            </div>

            {/* Categorías y Cuenta: el mismo campo desplegable que Período (rediseño de Movimientos).
                Categorías abre la lista con buscador en el propio diálogo; Cuenta, que son pocas, un
                desplegable con selección múltiple. */}
            <div className="flex flex-col gap-2">
              <p className="eyebrow">Categorías</p>
              <FieldButton
                onClick={openCategories}
                icon={<Tag className="size-[18px]" strokeWidth={1.8} aria-hidden />}
                label={selectionLabel(selectedCategoryNames, 'Todas las categorías', 'categorías')}
              />
            </div>

            {accounts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="eyebrow">Cuenta</p>
                <FieldButton
                  ref={accountTriggerRef}
                  open={accountOpen}
                  onClick={() => setAccountOpen((v) => !v)}
                  icon={<Wallet className="size-[18px]" strokeWidth={1.8} aria-hidden />}
                  label={selectionLabel(selectedAccountNames, 'Todas las cuentas', 'cuentas')}
                />
                {isWide ? (
                  <FloatingPanel open={accountOpen} onClose={() => setAccountOpen(false)} triggerRef={accountTriggerRef}>
                    {accountList}
                  </FloatingPanel>
                ) : (
                  <InDialogSheet open={accountOpen} onClose={() => setAccountOpen(false)} triggerRef={accountTriggerRef} title="Cuenta">
                    {accountList}
                  </InDialogSheet>
                )}
              </div>
            )}
          </div>
        ) : (
          // Rediseño de modales v2, filtro por categoría «B»: buscador relleno arriba y filas con la ficha
          // de la categoría y un check redondo, separadas por una línea.
          <div className="flex flex-col gap-2.5">
            <label className="flex h-11 items-center gap-2 rounded-control bg-fill-subtle px-3">
              <Search className="size-4 shrink-0 text-fg-muted" strokeWidth={2} aria-hidden />
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Buscar categoría"
                aria-label="Buscar categoría"
                className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium text-fg outline-none placeholder:text-fg-muted"
              />
            </label>

            <ul className="flex flex-col">
              {/* "Sin categoría" fuera de la lista buscable/agrupada por tipo: no es una categoría real
                  (no tiene `kind`), así que ni la búsqueda ni el agrupado Gastos/Ingresos aplican —
                  siempre visible, arriba de todo. Mismo sentinel que "Sin cuenta" en el filtro de
                  cuentas. */}
              <CheckRow
                leading={<CategoryChip {...chipLook(undefined)} size={28} />}
                name="Sin categoría"
                checked={selectedIds.has(UNCATEGORIZED_ID)}
                onToggle={() => toggleCategory(UNCATEGORIZED_ID)}
              />
              {noResults ? (
                <li className="px-1 py-3 text-[13px] text-fg-muted">
                  {term ? `Sin resultados para "${categorySearch.trim()}".` : 'No hay categorías para este tipo.'}
                </li>
              ) : (
                groups.map((group, i) => {
                  if (group.items.length === 0) return null
                  return (
                    <li key={group.title ?? i} className="flex flex-col">
                      {group.title && <p className="eyebrow px-1 pt-4 pb-1">{group.title}</p>}
                      <ul className="flex flex-col">
                        {group.items.map((category) => (
                          <CheckRow
                            key={category.id}
                            leading={<CategoryChip {...chipLook(category)} size={28} />}
                            name={category.name}
                            checked={selectedIds.has(category.id)}
                            onToggle={() => toggleCategory(category.id)}
                          />
                        ))}
                      </ul>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        )}
      </m.div>
    </Dialog>
  )
}

/** Fila con check redondo de las listas de selección múltiple — categorías (en su sub-vista) y
 *  cuentas (en el desplegable de Cuenta). */
function CheckRow({ leading, name, checked, onToggle }: { leading: ReactNode; name: string; checked: boolean; onToggle: () => void }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className={cn(
          'flex h-[50px] w-full items-center gap-3 px-1 text-left text-[14.5px] text-fg',
          checked ? 'font-semibold' : 'font-medium',
        )}
      >
        {leading}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span
          aria-hidden
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-full',
            checked ? 'bg-fg text-surface' : 'border-[1.5px] border-border-strong',
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3.5} />}
        </span>
      </button>
    </li>
  )
}

/** El ícono del tipo de cuenta en un cuadrado de 28px, a la altura de la ficha de categoría. */
function AccountGlyph({ icon }: { icon: ReactNode }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-fill-subtle text-fg-secondary">{icon}</span>
}
