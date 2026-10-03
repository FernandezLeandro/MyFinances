import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { SegmentedToggle } from '@/components/ui/SegmentedToggle'
import { centsToInputText, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { useCategories, useCategoryUsageCounts } from '@/features/categories/api'
import { CategoryPicker } from '@/features/categories/CategoryPicker'
import { useCreateFixedExpense, useFixedExpenses, useUpdateFixedExpense, type FixedExpense } from '@/features/fixed-expenses/api'
import { fixedExpenseNameError } from '@/features/fixed-expenses/aggregate'
import { FixedExpenseDeleteConfirmDialog } from '@/features/fixed-expenses/FixedExpenseDeleteConfirmDialog'
import { bagPeriodNoun } from '@/features/fixed-expenses/period'

const schema = z
  .object({
    // FI-16: `.trim()` antes de `min(1)` — si no, "   " pasa la validación (largo 3) y se guarda
    // vacío (`onSubmit` recorta antes de mandarlo a la API). FI-17: mensaje propio para `.max`, no el
    // default de Zod en inglés.
    name: z.string().trim().min(1, 'Falta el nombre').max(80, 'Máximo 80 caracteres'),
    // FI-18: sin tope, 11 cifras tiraban el error genérico de la base ("No se pudo guardar...") en
    // vez de uno claro acá.
    amount: z.string().refine(
      (v) => {
        const cents = parseAmountToCents(v)
        return cents !== null && cents > 0 && cents < MAX_AMOUNT_CENTS
      },
      { message: 'Ingresá un importe válido' },
    ),
    categoryId: z.string(),
    // Sólo aplica a "una vez al mes" — una bolsa no vence, así que no tiene día que pedir.
    dueDay: z.string(),
    isActive: z.boolean(),
    isRecurring: z.boolean(),
    // Sólo aplica a bolsas — ver `bagFrequency` en `FixedExpenseInput`.
    bagFrequency: z.enum(['monthly', 'biweekly', 'weekly']),
  })
  .superRefine((values, ctx) => {
    if (values.isRecurring) return
    const n = Number(values.dueDay)
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      ctx.addIssue({ code: 'custom', message: '1 a 31', path: ['dueDay'] })
    }
  })

type FormValues = z.infer<typeof schema>

interface FixedExpenseFormDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense?: FixedExpense | null
  /** Mes (`yyyy-MM-01`) que se está mirando en Fijos, sólo al editar. Cambiar el importe rige desde
   *  ese mes: los anteriores quedan como estaban (`rpc_set_fixed_expense_amount`). `fixedExpense.cents`
   *  ya viene resuelto a ese mes (`fixedExpenseAtPeriod`). Sin `period`, el importe no se toca. */
  period?: string
  /** Se llama cuando se confirma el borrado (sólo posible editando). Por defecto es `onClose` — pero
   *  cuando este form se abre anidado dentro de `FixedExpenseDetailDialog`, `onClose` sólo cierra el
   *  form y vuelve al detalle (que quedaría mostrando un fijo ya borrado); ahí conviene pasar el
   *  `onClose` del propio detalle, para cerrar los dos de un saque. */
  onDeleted?: () => void
}

/** Alta y edición de un fijo. Rediseño de modales v2: importe primero (centrado, grande), «cómo se
 *  paga» y frecuencia en segmentados, y la categoría con el mismo desplegable con fichas y buscador
 *  de Nuevo movimiento — en vez del `<select>` nativo, que no puede mostrar la ficha. */
export function FixedExpenseFormDialog({ open, onClose, fixedExpense, period, onDeleted }: FixedExpenseFormDialogProps) {
  const isEditing = !!fixedExpense
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // `true`: incluye archivadas — si el fijo ya tenía una categoría que después se archivó, el select
  // sigue mostrándola (ver `expenseCategories`) en vez de perderla en silencio al guardar.
  const { data: categories } = useCategories(true)
  const { data: categoryUsage } = useCategoryUsageCounts()
  // FI-19: `true` para comparar también contra los pausados — uno reactivado puede volver a chocar.
  const { data: allFixedExpenses } = useFixedExpenses(true)
  const createFixed = useCreateFixedExpense()
  const updateFixed = useUpdateFixedExpense()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true, isRecurring: false, bagFrequency: 'monthly' },
  })
  // Ya no viene de `isSubmitting`: `onSubmit` pasó a `.mutate()` sin `await` (saca la promesa
  // rechazada sin manejar cuando la base frena el alta), así que RHF ya no puede rastrear el
  // pendiente — mismo patrón que `MarkPaidDialog`.
  const isPending = createFixed.isPending || updateFixed.isPending

  const isActive = watch('isActive')
  const isRecurring = watch('isRecurring')
  const bagFrequency = watch('bagFrequency')
  const selectedCategoryId = watch('categoryId')
  const amount = watch('amount') ?? ''
  const name = watch('name')
  const expenseCategories = (categories ?? []).filter(
    (c) => c.kind === 'expense' && (!c.is_archived || c.id === selectedCategoryId),
  )
  // FI-19: se calcula siempre (no sólo cuando react-hook-form ya validó el campo) porque también
  // bloquea `canSubmit` — mismo criterio que `duplicateNameError` en AccountFormDialog.
  const duplicateNameError = useMemo(
    () => fixedExpenseNameError({ name, expenses: allFixedExpenses ?? [], excludeId: fixedExpense?.id }),
    [name, allFixedExpenses, fixedExpense],
  )
  const nameError = errors.name?.message ?? duplicateNameError ?? undefined
  // Importe distinto del que ya tenía ESTE mes: sólo entonces el cambio se aplica «desde este mes».
  const amountChanged = isEditing && !!period && parseAmountToCents(amount) !== fixedExpense.cents
  const amountHint =
    amountChanged && period
      ? `Rige desde ${format(parseISO(period), 'MMMM', { locale: es })}. Los meses anteriores quedan como estaban.`
      : undefined

  useEffect(() => {
    if (!open) return
    reset(
      fixedExpense
        ? {
            name: fixedExpense.name,
            amount: centsToInputText(fixedExpense.cents),
            categoryId: fixedExpense.category_id ?? '',
            dueDay: fixedExpense.due_day != null ? String(fixedExpense.due_day) : '',
            isActive: fixedExpense.is_active,
            isRecurring: fixedExpense.is_recurring,
            bagFrequency: fixedExpense.bag_frequency,
          }
        : {
            name: '',
            amount: '',
            categoryId: '',
            dueDay: '10',
            // Un fijo nuevo siempre arranca activo — el chip Activo/Pausado sólo tiene sentido al
            // editar (ver el chip más abajo, condicionado a `isEditing`).
            isActive: true,
            isRecurring: false,
            bagFrequency: 'monthly',
          },
    )
  }, [open, fixedExpense, reset])

  function onSubmit(values: FormValues) {
    // FI-19: el duplicado no es parte del schema de Zod (depende de la lista de fijos, fuera de este
    // form) — se frena acá, con el mismo mensaje ya mostrado al lado del campo.
    if (duplicateNameError) return

    const payload = {
      // Ya viene recortado por el `.trim()` del schema — no hace falta repetirlo acá.
      name: values.name,
      cents: parseAmountToCents(values.amount)!,
      categoryId: values.categoryId || null,
      dueDay: values.isRecurring ? null : Number(values.dueDay),
      isActive: values.isActive,
      isRecurring: values.isRecurring,
      bagFrequency: values.bagFrequency,
    }

    if (isEditing) {
      updateFixed.mutate({ id: fixedExpense.id, ...payload, amountFrom: amountChanged ? period : undefined }, { onSuccess: onClose })
    } else {
      createFixed.mutate(payload, { onSuccess: onClose })
    }
  }

  return (
    <>
      <Dialog
        // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio
        // código lo cierra vía `.close()` (acá pasa al abrir la confirmación encima) — sin este
        // filtro, confirmar el borrado cerraba todo el formulario de un tirón. Mismo gotcha que en
        // FixedExpenseDetailDialog.
        open={open && !confirmingDelete}
        onClose={() => !confirmingDelete && onClose()}
        title={isEditing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
        footerBleed
        footer={
          <DialogFooterBar
            start={
              isEditing && (
                <Button variant="ghost" size="dialogFooter" onClick={() => setConfirmingDelete(true)} className="text-negative! hover:text-negative!">
                  Eliminar fijo
                </Button>
              )
            }
          >
            <Button variant="outline" size="dialogFooter" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isPending || !!duplicateNameError}>
              {isPending ? 'Guardando…' : isEditing ? 'Guardar' : 'Agregar fijo'}
            </Button>
          </DialogFooterBar>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <OpeningAmountField
            size="lg"
            align="center"
            allowNegative={false}
            label={isRecurring ? `Presupuesto ${bagPeriodNoun(bagFrequency).adjective}` : 'Importe por mes'}
            ariaLabel="Importe"
            error={errors.amount?.message}
            hint={amountHint}
            value={amount}
            onChange={(v) => setValue('amount', v, { shouldValidate: isSubmitted })}
          />

          <div className="flex flex-col gap-2">
            <span className="eyebrow">¿Cómo se paga?</span>
            <SegmentedToggle
              variant="tabs"
              fill
              value={isRecurring ? 'bag' : 'once'}
              onChange={(v) => setValue('isRecurring', v === 'bag')}
              options={[
                { value: 'once', label: 'Una vez al mes' },
                { value: 'bag', label: 'Recurrente' },
              ]}
            />
            <p className="text-[12.5px] text-fg-secondary">
              {isRecurring ? 'Un presupuesto que vas cargando de a poco (nafta, mercadería…).' : 'Se paga una vez por mes, con fecha de vencimiento.'}
            </p>
          </div>

          {isRecurring && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Cada cuánto</span>
              <SegmentedToggle
                variant="tabs"
                fill
                value={bagFrequency}
                onChange={(v) => setValue('bagFrequency', v)}
                options={[
                  { value: 'monthly', label: 'Mensual' },
                  { value: 'biweekly', label: 'Quincenal' },
                  { value: 'weekly', label: 'Semanal' },
                ]}
              />
            </div>
          )}

          <Field label="Nombre" htmlFor="name" error={nameError}>
            <Input
              id="name"
              placeholder={isRecurring ? 'Nafta, mercadería de mamá…' : 'Internet, prepaga, alquiler…'}
              invalid={!!nameError}
              maxLength={80}
              {...register('name')}
            />
          </Field>

          {/* Debajo de 420px la categoría y el día no entran lado a lado sin que el desplegable quede
              de 150px — se apilan. */}
          <div className="flex flex-col gap-5 min-[420px]:flex-row min-[420px]:items-start min-[420px]:gap-3">
            <div className="min-w-0 flex-1">
              <CategoryPicker
                variant="dropdown"
                categories={expenseCategories}
                usage={categoryUsage}
                value={selectedCategoryId ?? ''}
                onChange={(id) => setValue('categoryId', id)}
              />
            </div>
            {!isRecurring && (
              <Field label="Vence el día" htmlFor="dueDay" error={errors.dueDay?.message} className="min-[420px]:w-20 min-[420px]:shrink-0">
                <Input id="dueDay" type="number" min={1} max={31} className="h-[50px] text-center font-display font-semibold" {...register('dueDay')} />
              </Field>
            )}
          </div>

          {/* Activo/Pausado sólo tiene sentido al editar un fijo existente — uno nuevo siempre
              arranca activo (ver el default de `reset` más arriba). */}
          {isEditing && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Estado</span>
              <SegmentedToggle
                variant="tabs"
                fill
                value={isActive ? 'active' : 'paused'}
                onChange={(v) => setValue('isActive', v === 'active')}
                options={[
                  { value: 'active', label: 'Activo' },
                  { value: 'paused', label: 'Pausado' },
                ]}
              />
            </div>
          )}
        </form>
      </Dialog>

      {isEditing && confirmingDelete && (
        <FixedExpenseDeleteConfirmDialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          fixedExpense={fixedExpense}
          onDeleted={onDeleted ?? onClose}
        />
      )}
    </>
  )
}
