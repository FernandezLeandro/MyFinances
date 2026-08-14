import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Select } from '@/components/ui/Select'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import {
  useCreateFixedExpense,
  useUpdateFixedExpense,
  type FixedExpense,
} from '@/features/fixed-expenses/api'

const schema = z.object({
  name: z.string().min(1, 'Falta el nombre').max(80),
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  categoryId: z.string().min(1, 'Elegí una categoría'),
  dueDay: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31, '1 a 31'),
  isActive: z.boolean(),
  isRecurring: z.boolean(),
  endsOn: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface FixedExpenseFormDialogProps {
  open: boolean
  onClose: () => void
  fixedExpense?: FixedExpense | null
}

export function FixedExpenseFormDialog({ open, onClose, fixedExpense }: FixedExpenseFormDialogProps) {
  const isEditing = !!fixedExpense
  const { data: categories } = useCategories()
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
    defaultValues: { isActive: true, isRecurring: false },
  })

  const isActive = watch('isActive')
  const isRecurring = watch('isRecurring')
  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense')

  useEffect(() => {
    if (!open) return
    reset(
      fixedExpense
        ? {
            name: fixedExpense.name,
            amount: centsToInputText(fixedExpense.cents),
            categoryId: fixedExpense.category_id ?? '',
            dueDay: String(fixedExpense.due_day),
            isActive: fixedExpense.is_active,
            isRecurring: fixedExpense.is_recurring,
            endsOn: fixedExpense.ends_on ?? '',
          }
        : { name: '', amount: '', categoryId: '', dueDay: '10', isActive: true, isRecurring: false, endsOn: '' },
    )
  }, [open, fixedExpense, reset])

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      cents: parseAmountToCents(values.amount)!,
      categoryId: values.categoryId,
      dueDay: Number(values.dueDay),
      isActive: values.isActive,
      isRecurring: values.isRecurring,
      endsOn: values.endsOn?.trim() || null,
    }

    if (isEditing) {
      await updateFixed.mutateAsync({ id: fixedExpense.id, ...payload })
    } else {
      await createFixed.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
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

        <Field label={isRecurring ? 'Presupuesto mensual' : 'Importe'} error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
          <Input
            id="name"
            placeholder={isRecurring ? 'Nafta, mercadería de mamá…' : 'Internet, prepaga, alquiler…'}
            invalid={!!errors.name}
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoría" htmlFor="categoryId" error={errors.categoryId?.message}>
            <Select id="categoryId" invalid={!!errors.categoryId} {...register('categoryId')}>
              <option value="">Elegir…</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Día de vencimiento"
            htmlFor="dueDay"
            hint={isRecurring ? 'Sólo para ordenar la lista' : '1 a 31'}
            error={errors.dueDay?.message}
          >
            <Input id="dueDay" type="number" min={1} max={31} {...register('dueDay')} />
          </Field>
        </div>

        <Field
          label="De baja desde"
          htmlFor="endsOn"
          labelAddon={
            <InfoTooltip text="No se borra: el fijo y su historial quedan guardados, sólo deja de contar a partir de esa fecha." />
          }
          hint="Opcional — para cuando cancelás algo"
        >
          <Input id="endsOn" type="date" {...register('endsOn')} />
        </Field>

        <div className="flex gap-1.5">
          <Chip active={isActive} onClick={() => setValue('isActive', true)}>
            Activo
          </Chip>
          <Chip active={!isActive} onClick={() => setValue('isActive', false)}>
            Pausado
          </Chip>
        </div>
      </form>
    </Dialog>
  )
}
