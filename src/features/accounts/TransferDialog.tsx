import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { parseAmountToCents } from '@/lib/money'
import { useBalanceLocations } from '@/features/reconciliation/api'
import { useCreateAccountTransfer } from '@/features/accounts/transfers-api'
import { AccountSelect } from '@/features/accounts/AccountSelect'

const schema = z
  .object({
    fromAccountId: z.string().min(1, 'Elegí de dónde sale'),
    toAccountId: z.string().min(1, 'Elegí a dónde entra'),
    amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
      message: 'Ingresá un importe válido',
    }),
    occurredOn: z.string().min(1, 'Falta la fecha'),
    description: z.string().max(140).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.fromAccountId && values.fromAccountId === values.toAccountId) {
      ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Elegí dos cuentas distintas' })
    }
  })

type FormValues = z.infer<typeof schema>

interface TransferDialogProps {
  open: boolean
  onClose: () => void
}

/** Mover plata entre tus propias cuentas (sacar efectivo del banco, pasar a Mercado Pago…) — no es
 *  gasto ni ingreso, así que no aparece en Movimientos ni mueve el saldo global. Ver
 *  `account_transfers` en la migración `cuentas_y_medios_de_pago`. */
export function TransferDialog({ open, onClose }: TransferDialogProps) {
  const { data: locations } = useBalanceLocations()
  const createTransfer = useCreateAccountTransfer()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amount: '',
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    },
  })

  useEffect(() => {
    if (open) reset({ fromAccountId: '', toAccountId: '', amount: '', occurredOn: format(new Date(), 'yyyy-MM-dd'), description: '' })
  }, [open, reset])

  async function onSubmit(values: FormValues) {
    await createTransfer.mutateAsync({
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      cents: parseAmountToCents(values.amount)!,
      occurredOn: values.occurredOn,
      description: values.description?.trim() || null,
    })
    onClose()
  }

  const hasEnoughAccounts = (locations ?? []).length >= 2

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Transferir entre cuentas"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting || !hasEnoughAccounts}>
            {isSubmitting ? 'Transfiriendo…' : 'Transferir'}
          </Button>
        </>
      }
    >
      {!hasEnoughAccounts ? (
        <p className="text-[13px] text-fg-muted">Necesitás al menos dos cuentas para transferir entre ellas.</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <Field label="Desde" htmlFor="fromAccountId" error={errors.fromAccountId?.message}>
            <AccountSelect
              id="fromAccountId"
              value={watch('fromAccountId')}
              onChange={(v) => setValue('fromAccountId', v)}
              emptyLabel="Elegir…"
            />
          </Field>

          <Field label="Hacia" htmlFor="toAccountId" error={errors.toAccountId?.message}>
            <AccountSelect
              id="toAccountId"
              value={watch('toAccountId')}
              onChange={(v) => setValue('toAccountId', v)}
              emptyLabel="Elegir…"
            />
          </Field>

          <Field label="Importe" error={errors.amount?.message}>
            <AmountInput invalid={!!errors.amount} {...register('amount')} />
          </Field>

          <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
            <Input id="occurredOn" type="date" invalid={!!errors.occurredOn} {...register('occurredOn')} />
          </Field>

          <Field label="Descripción" htmlFor="description" hint="Opcional">
            <Input id="description" autoComplete="off" {...register('description')} />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
