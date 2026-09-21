import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { fundingBalanceNote, maxFromAccountCents, overdrawError } from '@/features/accounts/aggregate'
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
  onClose: () => void
  /** Cuenta de origen ya elegida (al transferir desde el menú de una cuenta). */
  fromAccountId?: string
}

/** Mover plata entre tus propias cuentas (sacar efectivo del banco, pasar a Mercado Pago…) — no es
 *  gasto ni ingreso, así que no aparece en Movimientos ni mueve el saldo global. Ver
 *  `account_transfers` en la migración `cuentas_y_medios_de_pago`.
 *
 *  Se monta sólo mientras está abierto: el formulario arranca de cero cada vez, con el origen que
 *  llegue por prop. El botón queda apagado hasta que el formulario es válido; una falla al guardar
 *  se muestra adentro y no cierra el diálogo. */
export function TransferDialog({ onClose, fromAccountId = '' }: TransferDialogProps) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const createTransfer = useCreateAccountTransfer()
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      fromAccountId,
      toAccountId: '',
      amount: '',
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      description: '',
    },
  })

  // Sólo las activas: una archivada no se ofrece en los selectores, así que no alcanza para transferir.
  const active = (locations ?? []).filter((l) => !l.is_archived)
  const hasEnoughAccounts = active.length >= 2

  // No se transfiere más de lo que tiene la cuenta de origen (la base lo vuelve a comprobar).
  const fromLocation = active.find((l) => l.id === watch('fromAccountId'))
  const fromBalanceCents = fromLocation ? (balances?.get(fromLocation.id) ?? fromLocation.openingCents) : undefined
  const amountCents = parseAmountToCents(watch('amount'))
  const overdraw =
    fromLocation && fromBalanceCents !== undefined && amountCents !== null && amountCents > 0
      ? overdrawError(fromLocation.name, fromBalanceCents, amountCents)
      : null
  const maxCents = maxFromAccountCents(fromBalanceCents)

  // "Dos cuentas distintas" es un error de Hacia aunque lo dispare cambiar Desde: RHF sólo revalida
  // el campo que cambió, así que se pide revalidar los dos.
  function pickAccount(field: 'fromAccountId' | 'toAccountId', accountId: string) {
    setValue(field, accountId, { shouldValidate: true, shouldDirty: true })
    void trigger(['fromAccountId', 'toAccountId'])
    setSaveError(null)
  }

  async function onSubmit(values: FormValues) {
    setSaveError(null)
    const cents = parseAmountToCents(values.amount)!
    try {
      await createTransfer.mutateAsync({
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        cents,
        occurredOn: values.occurredOn,
        description: values.description?.trim() || null,
      })
      const nameOf = (id: string) => active.find((l) => l.id === id)?.name || 'la cuenta'
      showToast('Transferencia hecha', 'ok', {
        detail: `${nameOf(values.fromAccountId)} → ${nameOf(values.toAccountId)} · ${formatMoney(cents)}`,
      })
      onClose()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    }
  }

  const primaryLabel = isSubmitting ? 'Transfiriendo…' : saveError ? 'Reintentar' : 'Transferir'

  return (
    <Dialog
      open
      onClose={onClose}
      title="Transferir entre cuentas"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="transfer-form"
            size="dialogFooter"
            disabled={!hasEnoughAccounts || !isValid || !!overdraw}
            loading={isSubmitting}
          >
            {primaryLabel}
          </Button>
        </DialogFooterBar>
      }
    >
      {!hasEnoughAccounts ? (
        <p className="text-[13px] text-fg-muted">Necesitás al menos dos cuentas para transferir entre ellas.</p>
      ) : (
        <form id="transfer-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Desde" htmlFor="fromAccountId" error={errors.fromAccountId?.message}>
              <AccountSelect
                id="fromAccountId"
                value={watch('fromAccountId')}
                onChange={(v) => pickAccount('fromAccountId', v)}
                emptyLabel="Elegir…"
              />
            </Field>

            <Field label="Hacia" htmlFor="toAccountId" error={errors.toAccountId?.message}>
              <AccountSelect
                id="toAccountId"
                value={watch('toAccountId')}
                onChange={(v) => pickAccount('toAccountId', v)}
                emptyLabel="Elegir…"
              />
            </Field>
          </div>

          <OpeningAmountField
            label="Importe"
            allowNegative={false}
            value={watch('amount')}
            onChange={(v) => {
              setValue('amount', v, { shouldValidate: true, shouldDirty: true })
              setSaveError(null)
            }}
            error={errors.amount?.message ?? overdraw ?? undefined}
            hint={
              fromLocation && fromBalanceCents !== undefined
                ? fundingBalanceNote(fromLocation.name, fromBalanceCents, amountCents)
                : undefined
            }
            onMax={
              maxCents === null
                ? undefined
                : () => {
                    setValue('amount', centsToInputText(maxCents), { shouldValidate: true, shouldDirty: true })
                    setSaveError(null)
                  }
            }
            maxTitle={maxCents === null ? undefined : formatMoney(maxCents)}
            ariaLabel="Importe a transferir"
          />

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[170px_minmax(0,1fr)]">
            <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
              <Input id="occurredOn" type="date" invalid={!!errors.occurredOn} {...register('occurredOn')} />
            </Field>

            <Field label="Descripción" labelAddon={<span className="text-[11px] text-fg-faint">opcional</span>} htmlFor="description">
              <Input id="description" autoComplete="off" placeholder="Retiro del cajero…" {...register('description')} />
            </Field>
          </div>

          <p className="-mt-1 text-[12px] leading-normal text-fg-muted text-pretty">
            No es gasto ni ingreso: el total no cambia, solo cambia de lugar.
          </p>

          {saveError && (
            <DialogSaveError title="No se pudo hacer la transferencia">{saveError} Tus datos siguen acá.</DialogSaveError>
          )}
        </form>
      )}
    </Dialog>
  )
}
