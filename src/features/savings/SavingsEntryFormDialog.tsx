import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { parseAmountToCents, type Currency } from '@/lib/money'
import {
  useCreateSavingsEntry,
  useDeleteSavingsEntry,
  useUpdateSavingsEntry,
  type SavingsBucket,
  type SavingsEntry,
} from '@/features/savings/api'

const schema = z.object({
  kind: z.enum(['deposit', 'withdrawal']),
  currency: z.enum(['ARS', 'USD']),
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  rate: z
    .string()
    .optional()
    .refine((v) => !v || (parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0), 'Cotización inválida'),
  occurredOn: z.string().min(1, 'Falta la fecha'),
  note: z.string().max(140).optional(),
})

type FormValues = z.infer<typeof schema>

function centsToInputText(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface SavingsEntryFormDialogProps {
  open: boolean
  onClose: () => void
  bucket: SavingsBucket
  entry?: SavingsEntry | null
}

export function SavingsEntryFormDialog({ open, onClose, bucket, entry }: SavingsEntryFormDialogProps) {
  const isEditing = !!entry
  const createEntry = useCreateSavingsEntry()
  const updateEntry = useUpdateSavingsEntry()
  const deleteEntry = useDeleteSavingsEntry()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'deposit', currency: 'ARS', occurredOn: format(new Date(), 'yyyy-MM-dd') },
  })

  const kind = watch('kind')
  const currency = watch('currency')

  useEffect(() => {
    if (!open) return
    reset(
      entry
        ? {
            kind: entry.kind,
            currency: entry.currency,
            amount: centsToInputText(entry.cents),
            rate: entry.rateToMainCents != null ? centsToInputText(entry.rateToMainCents) : '',
            occurredOn: entry.occurred_on,
            note: entry.note ?? '',
          }
        : {
            kind: 'deposit',
            currency: 'ARS',
            amount: '',
            rate: '',
            occurredOn: format(new Date(), 'yyyy-MM-dd'),
            note: '',
          },
    )
  }, [open, entry, reset])

  async function onSubmit(values: FormValues) {
    const cents = parseAmountToCents(values.amount)!
    // Un retiro no "compra" nada: la cotización de compra sólo aplica a un depósito.
    const rateCents =
      values.currency === 'USD' && values.kind === 'deposit' && values.rate ? parseAmountToCents(values.rate) : null
    const payload = {
      bucketId: bucket.id,
      kind: values.kind,
      currency: values.currency as Currency,
      cents,
      rateToMainCents: rateCents,
      occurredOn: values.occurredOn,
      note: values.note?.trim() || null,
    }

    if (isEditing) {
      await updateEntry.mutateAsync({ id: entry.id, ...payload })
    } else {
      await createEntry.mutateAsync(payload)
    }
    onClose()
  }

  async function onDelete() {
    if (!entry) return
    await deleteEntry.mutateAsync(entry.id)
    onClose()
  }

  function selectCurrency(next: Currency) {
    if (next === currency) return
    setValue('currency', next)
    if (next === 'ARS') setValue('rate', '')
  }

  function selectKind(next: FormValues['kind']) {
    if (next === kind) return
    setValue('kind', next)
    if (next === 'withdrawal') setValue('rate', '')
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? `Editar aporte — ${bucket.name}` : `Nuevo aporte — ${bucket.name}`}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onDelete} disabled={deleteEntry.isPending} className="mr-auto">
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
          <Chip active={kind === 'deposit'} onClick={() => selectKind('deposit')}>
            Aporte
          </Chip>
          <Chip active={kind === 'withdrawal'} onClick={() => selectKind('withdrawal')}>
            Retiro
          </Chip>
        </div>

        {!bucket.single_currency && (
          <div className="flex gap-1.5">
            <Chip active={currency === 'ARS'} onClick={() => selectCurrency('ARS')}>
              ARS
            </Chip>
            <Chip active={currency === 'USD'} onClick={() => selectCurrency('USD')}>
              USD
            </Chip>
          </div>
        )}

        <Field label="Importe" error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        {currency === 'USD' && kind === 'deposit' && (
          <Field
            label="Cotización de compra (ARS por USD)"
            htmlFor="rate"
            hint="Opcional — hace falta para calcular la ganancia más adelante"
            error={errors.rate?.message}
          >
            <Input id="rate" inputMode="decimal" placeholder="0,00" invalid={!!errors.rate} {...register('rate')} />
          </Field>
        )}

        <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
          <Input id="occurredOn" type="date" invalid={!!errors.occurredOn} {...register('occurredOn')} />
        </Field>

        <Field label="Nota" htmlFor="note" hint="Opcional">
          <Input id="note" autoComplete="off" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  )
}
