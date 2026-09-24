import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { useCreateFixedExpense, useUpdateFixedExpense, type FixedExpense } from '@/features/fixed-expenses/api'
import { FixedExpenseDeleteConfirmDialog } from '@/features/fixed-expenses/FixedExpenseDeleteConfirmDialog'
import { bagPeriodNoun } from '@/features/fixed-expenses/period'

const schema = z
  .object({
    // FI-16: `.trim()` antes de `min(1)` — si no, "   " pasa la validación (largo 3) y se guarda
    // vacío (`onSubmit` recorta antes de mandarlo a la API). FI-17: mensaje propio para `.max`, no el
    // default de Zod en inglés.
    name: z.string().trim().min(1, 'Falta el nombre').max(80, 'Máximo 80 caracteres'),
    amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
      message: 'Ingresá un importe válido',
    }),
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
  /** Se llama cuando se confirma el borrado (sólo posible editando). Por defecto es `onClose` — pero
   *  cuando este form se abre anidado dentro de `FixedExpenseDetailDialog`, `onClose` sólo cierra el
   *  form y vuelve al detalle (que quedaría mostrando un fijo ya borrado); ahí conviene pasar el
   *  `onClose` del propio detalle, para cerrar los dos de un saque. */
  onDeleted?: () => void
}

export function FixedExpenseFormDialog({ open, onClose, fixedExpense, onDeleted }: FixedExpenseFormDialogProps) {
  const isEditing = !!fixedExpense
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // `true`: incluye archivadas — si el fijo ya tenía una categoría que después se archivó, el select
  // sigue mostrándola (ver `expenseCategories`) en vez de perderla en silencio al guardar.
  const { data: categories } = useCategories(true)
  const createFixed = useCreateFixedExpense()
  const updateFixed = useUpdateFixedExpense()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true, isRecurring: false, bagFrequency: 'monthly' },
  })

  const isActive = watch('isActive')
  const isRecurring = watch('isRecurring')
  const bagFrequency = watch('bagFrequency')
  const selectedCategoryId = watch('categoryId')
  const expenseCategories = (categories ?? []).filter(
    (c) => c.kind === 'expense' && (!c.is_archived || c.id === selectedCategoryId),
  )

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

  async function onSubmit(values: FormValues) {
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
      await updateFixed.mutateAsync({ id: fixedExpense.id, ...payload })
    } else {
      await createFixed.mutateAsync(payload)
    }
    onClose()
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
        footer={
          <>
            {isEditing && (
              <Button variant="danger" size="dialogFooter" onClick={() => setConfirmingDelete(true)} className="sm:mr-auto">
                Eliminar
              </Button>
            )}
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <div className="flex gap-1.5">
            <Chip active={!isRecurring} onClick={() => setValue('isRecurring', false)}>
              Una vez al mes
            </Chip>
            <Chip active={isRecurring} onClick={() => setValue('isRecurring', true)}>
              Recurrente
            </Chip>
          </div>

          {isRecurring && (
            <Field label="Frecuencia del presupuesto">
              <div className="flex gap-1.5">
                <Chip active={bagFrequency === 'monthly'} onClick={() => setValue('bagFrequency', 'monthly')}>
                  Mensual
                </Chip>
                <Chip active={bagFrequency === 'biweekly'} onClick={() => setValue('bagFrequency', 'biweekly')}>
                  Quincenal
                </Chip>
                <Chip active={bagFrequency === 'weekly'} onClick={() => setValue('bagFrequency', 'weekly')}>
                  Semanal
                </Chip>
              </div>
            </Field>
          )}

          <Field
            label={isRecurring ? `Presupuesto ${bagPeriodNoun(bagFrequency).adjective}` : 'Importe'}
            error={errors.amount?.message}
          >
            <AmountInput invalid={!!errors.amount} {...register('amount')} />
          </Field>

          <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
            <Input
              id="name"
              placeholder={isRecurring ? 'Nafta, mercadería de mamá…' : 'Internet, prepaga, alquiler…'}
              invalid={!!errors.name}
              maxLength={80}
              {...register('name')}
            />
          </Field>

          <div className={cn('grid gap-4', !isRecurring && 'grid-cols-2')}>
            <Field label="Categoría" htmlFor="categoryId" hint="Opcional">
              <Select id="categoryId" {...register('categoryId')}>
                <option value="">Sin categoría</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_archived && ' (archivada)'}
                  </option>
                ))}
              </Select>
            </Field>

            {!isRecurring && (
              <Field label="Día de vencimiento" htmlFor="dueDay" hint="1 a 31" error={errors.dueDay?.message}>
                <Input id="dueDay" type="number" min={1} max={31} {...register('dueDay')} />
              </Field>
            )}
          </div>

          {/* Activo/Pausado sólo tiene sentido al editar un fijo existente — uno nuevo siempre
              arranca activo (ver el default de `reset` más arriba). */}
          {isEditing && (
            <div className="flex gap-1.5">
              <Chip active={isActive} onClick={() => setValue('isActive', true)}>
                Activo
              </Chip>
              <Chip active={!isActive} onClick={() => setValue('isActive', false)}>
                Pausado
              </Chip>
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
