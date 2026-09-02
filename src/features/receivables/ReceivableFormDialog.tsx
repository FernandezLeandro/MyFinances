import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCreateReceivable, useUpdateReceivable, type Receivable } from '@/features/receivables/api'

const schema = z.object({
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  name: z.string().min(1, 'Falta el nombre').max(80),
  expectedPeriod: z.string().optional(),
  alreadyExpensed: z.boolean(),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ReceivableFormDialogProps {
  open: boolean
  onClose: () => void
  receivable?: Receivable | null
  /** `already_expensed` en alta arranca en `false`: el caso que trae al alta rápida desde Cuadrar
   *  Saldo es por definición "presté efectivo y el cuadre no da". */
  defaultAlreadyExpensed?: boolean
  /** Si la deuda ya tiene abonos registrados, el flag no se puede tocar más — ver el comentario
   *  del chip de abajo. */
  hasPayments?: boolean
}

/**
 * Alta/edición de una deuda a favor. `already_expensed` decide si prestar cuenta como plata tuya
 * en Cuadrar Saldo o si ya salió del saldo como un gasto real (ver el comentario de la migración
 * `receivables_deudas_a_favor` para el porqué completo) — es la única decisión de la que depende
 * `reconciliar()`, así que se pide con dos `Chip` bien visibles en vez de un checkbox chico.
 */
export function ReceivableFormDialog({
  open,
  onClose,
  receivable,
  defaultAlreadyExpensed = false,
  hasPayments = false,
}: ReceivableFormDialogProps) {
  const isEditing = !!receivable
  const createReceivable = useCreateReceivable()
  const updateReceivable = useUpdateReceivable()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', name: '', expectedPeriod: '', alreadyExpensed: defaultAlreadyExpensed, note: '' },
  })

  const alreadyExpensed = watch('alreadyExpensed')

  useEffect(() => {
    if (!open) return
    reset(
      receivable
        ? {
            amount: centsToInputText(receivable.amountCents),
            name: receivable.name,
            expectedPeriod: receivable.expected_period?.slice(0, 7) ?? '',
            alreadyExpensed: receivable.already_expensed,
            note: receivable.note ?? '',
          }
        : { amount: '', name: '', expectedPeriod: '', alreadyExpensed: defaultAlreadyExpensed, note: '' },
    )
  }, [open, receivable, defaultAlreadyExpensed, reset])

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name.trim(),
      cents: parseAmountToCents(values.amount)!,
      expectedPeriod: values.expectedPeriod ? `${values.expectedPeriod}-01` : null,
      alreadyExpensed: values.alreadyExpensed,
      note: values.note?.trim() || null,
    }

    if (isEditing) {
      await updateReceivable.mutateAsync({ id: receivable.id, ...payload })
    } else {
      await createReceivable.mutateAsync(payload)
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar deuda' : 'Nueva deuda'}
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
        <Field label="Importe" error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        <Field label="Quién te debe" htmlFor="name" error={errors.name?.message}>
          <Input id="name" placeholder="Juan, mi hermana…" invalid={!!errors.name} {...register('name')} />
        </Field>

        <Field label="Cuándo lo cobrás" htmlFor="expectedPeriod" hint="Opcional — para no olvidarte">
          <Input id="expectedPeriod" type="month" {...register('expectedPeriod')} />
        </Field>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="eyebrow">Cómo se la prestaste</span>
            <InfoTooltip text="Si pagaste algo ajeno con tarjeta o débito y ya cargaste el gasto, esa plata ya salió de tu saldo. Cuando te la devuelvan se registra como un ingreso. Si le diste efectivo, esa plata sigue siendo tuya hasta que te la devuelvan." />
          </div>
          <div className="flex gap-1.5">
            <Chip
              active={!alreadyExpensed}
              onClick={hasPayments ? undefined : () => setValue('alreadyExpensed', false)}
              className={hasPayments ? 'opacity-50' : undefined}
            >
              Le presté efectivo
            </Chip>
            <Chip
              active={alreadyExpensed}
              onClick={hasPayments ? undefined : () => setValue('alreadyExpensed', true)}
              className={hasPayments ? 'opacity-50' : undefined}
            >
              Ya lo cargué como gasto
            </Chip>
          </div>
          {hasPayments && (
            <p className="mt-2 text-[12px] text-chalk-faint">
              No se puede cambiar: ya registraste abonos con este criterio.
            </p>
          )}
        </div>

        <Field label="Nota" htmlFor="note" hint="Opcional">
          <Input id="note" placeholder="Me lo devuelve cuando cobre el aguinaldo…" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  )
}
