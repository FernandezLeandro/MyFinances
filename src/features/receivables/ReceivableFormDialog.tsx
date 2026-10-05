import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DialogConfirmStack, DialogFooterBar } from '@/components/ui/dialog-parts'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { centsToInputText, formatMoney, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { ultimoPeriodo } from '@/features/credits/period'
import { useCreateReceivable, useDeleteReceivable, useUpdateReceivable, type Receivable } from '@/features/receivables/api'
import { cuotaCents } from '@/features/receivables/aggregate'
import { PersonNameInput } from '@/features/receivables/PersonNameInput'
import { AccountField } from '@/features/accounts/AccountField'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'

const schema = z
  .object({
    amount: z.string().refine(
      (v) => {
        const cents = parseAmountToCents(v)
        return cents !== null && cents > 0 && cents < MAX_AMOUNT_CENTS
      },
      { message: 'Ingresá un importe válido' },
    ),
    name: z.string().trim().min(1, 'Falta el nombre').max(80),
    installments: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120, '1 a 120'),
    expectedPeriod: z.string(),
    note: z.string(),
  })
  // Con cuotas, el mes de la primera es lo que ubica a cada una — la base lo exige igual
  // (`receivables_installments_need_period`).
  .refine((v) => Number(v.installments) === 1 || v.expectedPeriod !== '', {
    path: ['expectedPeriod'],
    message: 'Falta el mes de la primera cuota',
  })

type FormValues = z.infer<typeof schema>

interface ReceivableFormDialogProps {
  open: boolean
  onClose: () => void
  receivable?: Receivable | null
  /** Se llama al borrar la deuda — por defecto `onClose`; desde el panel de la deuda conviene cerrar
   *  también el panel, que quedaría mostrando una deuda que ya no existe. */
  onDeleted?: () => void
}

/**
 * Alta/edición de una deuda a favor. Arquetipo «importe primero», igual que la compra de Mis Deudas:
 * el total prestado, a quién, en cuántas cuotas y desde qué mes.
 *
 * El movimiento es una sola decisión opcional, sólo al prestar: «Registrar el gasto en Préstamos»
 * (prendido por defecto). Al editar no se ofrece — cambiar `already_expensed` con un update suelto
 * dejaría un gasto huérfano o contado dos veces; para eso están "Registrar el gasto ahora" y
 * "Deshacer" en el panel de la deuda, que pasan por RPC.
 *
 * Se monta sólo mientras está abierto (`{open && …}` en quien lo usa), así que los valores iniciales
 * salen directo de las props, sin `reset` en un efecto.
 */
export function ReceivableFormDialog({ open, onClose, receivable, onDeleted = onClose }: ReceivableFormDialogProps) {
  const isEditing = !!receivable
  const createReceivable = useCreateReceivable()
  const updateReceivable = useUpdateReceivable()
  const deleteReceivable = useDeleteReceivable()
  const isPending = createReceivable.isPending || updateReceivable.isPending
  const picker = useAccountPicker()
  const [accountId, setAccountId] = useDefaultAccountId()
  const [generateMovement, setGenerateMovement] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: receivable
      ? {
          amount: centsToInputText(receivable.amountCents),
          name: receivable.name,
          installments: String(receivable.installments),
          expectedPeriod: receivable.expected_period?.slice(0, 7) ?? '',
          note: receivable.note ?? '',
        }
      : { amount: '', name: '', installments: '1', expectedPeriod: '', note: '' },
  })

  const amount = watch('amount')
  const installments = watch('installments')
  const expectedPeriod = watch('expectedPeriod')
  const n = Number(installments)
  const conCuotas = Number.isInteger(n) && n > 1
  const cents = parseAmountToCents(amount)
  const withMovement = !isEditing && generateMovement
  const accountMissing = withMovement && picker.show && !accountId

  const preview = useMemo(() => {
    if (cents == null || cents <= 0 || !Number.isInteger(n) || n < 2 || n > 120) return null
    const base = cuotaCents(cents, n, 1)
    const last = cuotaCents(cents, n, n)
    const cuotas = base === last ? `${n} cuotas de ${formatMoney(base)}` : `${n} cuotas de ${formatMoney(base)} (la última ${formatMoney(last)})`
    if (!expectedPeriod) return cuotas
    const first = `${expectedPeriod}-01`
    const desde = format(parseISO(first), 'MMM yyyy', { locale: es })
    const hasta = format(parseISO(ultimoPeriodo(first, n)), 'MMM yyyy', { locale: es })
    return `${cuotas} · de ${desde} a ${hasta}`
  }, [cents, n, expectedPeriod])

  function onSubmit(values: FormValues) {
    if (accountMissing) return
    const payload = {
      name: values.name.trim(),
      cents: parseAmountToCents(values.amount)!,
      expectedPeriod: values.expectedPeriod ? `${values.expectedPeriod}-01` : null,
      installments: Number(values.installments),
      note: values.note.trim() || null,
    }
    if (isEditing) {
      updateReceivable.mutate({ id: receivable.id, ...payload }, { onSuccess: onClose })
    } else {
      createReceivable.mutate(
        { ...payload, expense: withMovement ? { accountId: accountId || null } : null },
        { onSuccess: onClose },
      )
    }
  }

  if (confirmingDelete && receivable) {
    return (
      <Dialog
        open={open}
        onClose={() => setConfirmingDelete(false)}
        title="Eliminar deuda"
        footer={
          <DialogConfirmStack
            confirmLabel="Eliminar"
            pendingLabel="Eliminando…"
            pending={deleteReceivable.isPending}
            onConfirm={() => deleteReceivable.mutate(receivable.id, { onSuccess: onDeleted })}
            onCancel={() => setConfirmingDelete(false)}
          />
        }
      >
        <p className="text-[14px] text-fg-secondary">
          ¿Eliminar la deuda de <span className="text-fg">{receivable.name}</span>? Se borra también su historial de
          abonos. Los movimientos ya registrados no se tocan.
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar deuda' : 'Nueva deuda'}
      footerBleed
      footer={
        <DialogFooterBar
          start={
            isEditing && (
              <Button
                variant="ghost"
                size="dialogFooter"
                onClick={() => setConfirmingDelete(true)}
                className="text-negative! hover:text-negative!"
              >
                Eliminar
              </Button>
            )
          }
        >
          <Button variant="outline" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isPending || accountMissing}>
            {isPending ? 'Guardando…' : isEditing ? 'Guardar' : 'Agregar deuda'}
          </Button>
        </DialogFooterBar>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <OpeningAmountField
          size="lg"
          align="center"
          allowNegative={false}
          label="Le prestaste"
          ariaLabel="Total prestado"
          autoFocus={!isEditing}
          error={errors.amount?.message}
          value={amount}
          onChange={(v) => setValue('amount', v, { shouldValidate: isSubmitted })}
        />

        <Field label="Quién te debe" htmlFor="name" error={errors.name?.message}>
          <PersonNameInput id="name" placeholder="Juan, mi hermana…" invalid={!!errors.name} {...register('name')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuotas" htmlFor="installments" error={errors.installments?.message}>
            <Input id="installments" type="number" inputMode="numeric" min={1} max={120} invalid={!!errors.installments} {...register('installments')} />
          </Field>
          <Field
            label={conCuotas ? 'Primera cuota' : 'Te lo devuelve'}
            htmlFor="expectedPeriod"
            hint={conCuotas ? undefined : 'Opcional'}
            error={errors.expectedPeriod?.message}
          >
            <Input id="expectedPeriod" type="month" invalid={!!errors.expectedPeriod} {...register('expectedPeriod')} />
          </Field>
        </div>

        {preview && <p className="-mt-2 text-[12px] text-fg-muted">{preview}</p>}

        {isEditing ? (
          <p className="text-[12.5px] text-fg-muted">
            {receivable.expense_transaction_id != null
              ? 'Se registró un gasto en Préstamos al prestar.'
              : receivable.already_expensed
                ? 'Ya la contaste como gasto.'
                : 'Sin movimiento: esa plata no salió de tu saldo.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2.5 text-[13px] text-fg">
              <input
                type="checkbox"
                checked={generateMovement}
                onChange={(e) => setGenerateMovement(e.target.checked)}
                className="size-4 shrink-0 accent-accent"
              />
              Registrar el gasto en Préstamos
            </label>
            {withMovement && picker.show && (
              <AccountField label="Con qué se lo diste" accountId={accountId} onChange={setAccountId} deltaCents={cents == null ? null : -cents} />
            )}
          </div>
        )}

        <Field label="Nota" htmlFor="note" hint="Opcional">
          <Input id="note" placeholder="Me lo devuelve cuando cobre el aguinaldo…" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  )
}
