import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  type Transaction,
  type TransactionType,
} from '@/features/transactions/api'

const schema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  categoryId: z.string().min(1, 'Elegí una categoría'),
  occurredOn: z.string().min(1, 'Falta la fecha'),
  description: z.string().max(140).optional(),
})

type FormValues = z.infer<typeof schema>

function centsToInputText(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface TransactionFormDialogProps {
  open: boolean
  onClose: () => void
  /** Si viene, el dialog edita esta transacción en vez de crear una nueva. */
  transaction?: Transaction | null
  /** Precarga tipo e importe en un alta nueva (ej. "Ajustar saldo" → "Registrar como movimiento"). Se ignora si viene `transaction`. */
  prefill?: { type: TransactionType; cents: number }
}

export function TransactionFormDialog({ open, onClose, transaction, prefill }: TransactionFormDialogProps) {
  const isEditing = !!transaction
  const { data: categories } = useCategories()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'expense', occurredOn: format(new Date(), 'yyyy-MM-dd') },
  })

  const type = watch('type')

  useEffect(() => {
    if (!open) return
    reset(
      transaction
        ? {
            type: transaction.type,
            amount: centsToInputText(transaction.cents),
            categoryId: transaction.category_id ?? '',
            occurredOn: transaction.occurred_on,
            description: transaction.description ?? '',
          }
        : {
            type: prefill?.type ?? 'expense',
            amount: prefill ? centsToInputText(prefill.cents) : '',
            categoryId: '',
            occurredOn: format(new Date(), 'yyyy-MM-dd'),
            description: '',
          },
    )
  }, [open, transaction, prefill, reset])

  const categoriesForType = (categories ?? []).filter((c) => c.kind === type)

  async function onSubmit(values: FormValues) {
    const cents = parseAmountToCents(values.amount)!
    const payload = {
      type: values.type,
      cents,
      occurredOn: values.occurredOn,
      categoryId: values.categoryId,
      description: values.description?.trim() || null,
    }

    if (isEditing) {
      await updateTx.mutateAsync({ id: transaction.id, ...payload })
    } else {
      await createTx.mutateAsync(payload)
    }
    onClose()
  }

  async function onDelete() {
    if (!transaction) return
    await deleteTx.mutateAsync(transaction.id)
    onClose()
  }

  function selectType(next: TransactionType) {
    if (next === type) return
    setValue('type', next)
    setValue('categoryId', '') // la categoría elegida ya no aplica al otro tipo
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar movimiento' : 'Nuevo movimiento'}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onDelete} disabled={deleteTx.isPending} className="mr-auto">
              Eliminar
            </Button>
          )}
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
          <Chip active={type === 'expense'} onClick={() => selectType('expense')}>
            Gasto
          </Chip>
          <Chip active={type === 'income'} onClick={() => selectType('income')}>
            Ingreso
          </Chip>
        </div>

        <Field label="Importe" error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        <Field label="Categoría" htmlFor="categoryId" error={errors.categoryId?.message}>
          <Select id="categoryId" invalid={!!errors.categoryId} {...register('categoryId')}>
            <option value="">Elegir…</option>
            {categoriesForType.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
          <Input id="occurredOn" type="date" invalid={!!errors.occurredOn} {...register('occurredOn')} />
        </Field>

        <Field label="Descripción" htmlFor="description" hint="Opcional">
          <Input id="description" autoComplete="off" {...register('description')} />
        </Field>
      </form>
    </Dialog>
  )
}
