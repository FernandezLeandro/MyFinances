import { useEffect, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { useCreateReceivable, useUpdateReceivable, type Receivable } from '@/features/receivables/api'
import { PersonNameInput } from '@/features/receivables/PersonNameInput'
import { useAccountPicker } from '@/features/accounts/useAccountPicker'
import { AccountSelect } from '@/features/accounts/AccountSelect'

/** Las tres respuestas a "¿qué pasa con tu saldo?" — `descontar` es la única que además dispara un
 *  gasto; las otras dos mapean 1:1 a los dos valores de `already_expensed` que ya existían. */
type SaldoOption = 'sigue' | 'descontar' | 'ya_gastado'

const schema = z.object({
  amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  name: z.string().min(1, 'Falta el nombre').max(80),
  expectedPeriod: z.string().optional(),
  saldoOption: z.enum(['sigue', 'descontar', 'ya_gastado']),
  expenseCategoryId: z.string().optional(),
  expenseOccurredOn: z.string().optional(),
  expenseAccountId: z.string().optional(),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

function saldoOptionFromReceivable(receivable: Receivable): SaldoOption {
  // Una deuda ya editada no distingue "descontala ahora" de "ya cargué el gasto" — las dos dejan
  // `already_expensed = true` y no guardan por qué se llegó ahí si no hay `expense_transaction_id`
  // (filas de antes de esta migración). Al editar, ambas caen en "ya cargué el gasto": no hay forma
  // de volver a generar el gasto sin duplicarlo, así que no se ofrece la opción "descontar" en edición.
  return receivable.already_expensed ? 'ya_gastado' : 'sigue'
}

interface ReceivableFormDialogProps {
  open: boolean
  onClose: () => void
  receivable?: Receivable | null
  /** Arranca en "sigue en mi saldo" o en "ya gastado" según el punto de entrada. */
  defaultAlreadyExpensed?: boolean
  /** Si la deuda ya tiene abonos registrados, la respuesta a "¿qué pasa con tu saldo?" no se puede
   *  tocar más — ver el comentario de los chips de abajo. */
  hasPayments?: boolean
}

/**
 * Alta/edición de una deuda a favor. "¿Qué pasa con tu saldo?" es la única decisión de la que
 * depende `reconciliar()` (ver `receivables_deudas_a_favor` y `deudas_flujo_movimientos` para el
 * porqué completo), así que se pide con `Chip`s bien visibles en vez de un checkbox chico. La
 * tercera opción, "descontala ahora", dispara además la creación del gasto en el mismo paso — ver
 * `ReceivableInput.expense`.
 */
export function ReceivableFormDialog({
  open,
  onClose,
  receivable,
  defaultAlreadyExpensed = false,
  hasPayments = false,
}: ReceivableFormDialogProps) {
  const isEditing = !!receivable
  // Si "descontala ahora" ya generó un gasto real, este form (un `update` directo, no un RPC) no
  // puede tocar `already_expensed` sin dejar ese gasto huérfano: volver a "sigue en mi saldo" desde
  // acá contaría esa plata dos veces (el gasto real en Movimientos Y la deuda de nuevo dentro del
  // saldo). El único camino de vuelta es "Deshacer descuento" en el detalle, que sí borra el gasto.
  const lockedByExpense = isEditing && receivable.expense_transaction_id != null
  const locked = hasPayments || lockedByExpense
  const createReceivable = useCreateReceivable()
  const updateReceivable = useUpdateReceivable()
  const { data: categories } = useCategories()
  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense')
  const picker = useAccountPicker()
  const defaultAccountId = picker.defaultId

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      name: '',
      expectedPeriod: '',
      saldoOption: defaultAlreadyExpensed ? 'ya_gastado' : 'sigue',
      expenseCategoryId: '',
      expenseOccurredOn: format(new Date(), 'yyyy-MM-dd'),
      expenseAccountId: '',
      note: '',
    },
  })

  const saldoOption = watch('saldoOption')

  // `defaultAccountId` NO va en las deps de este efecto — mismo bug que en `TransactionFormDialog`:
  // si `useBalanceLocations()` resuelve después de que el usuario ya empezó a completar el
  // formulario, re-disparar el `reset` completo por ese cambio le borraría todo lo tipeado. El
  // prefill de cuenta vive aparte, en el efecto de abajo.
  //
  // `didResetRef`: sin esto, `<StrictMode>` vuelve a invocar este efecto una segunda vez en
  // desarrollo apenas monta, aunque nada de las deps haya cambiado. Si `defaultAccountId` ya
  // estaba en caché al abrir, esa segunda pasada llegaba DESPUÉS de que el efecto de abajo ya
  // hubiera precargado la cuenta y la volvía a pisar con `''` — mismo bug encontrado y corregido en
  // `TransactionFormDialog`, ver el comentario ahí para el porqué completo.
  const didResetRef = useRef(false)
  useEffect(() => {
    if (!open) {
      didResetRef.current = false
      return
    }
    if (didResetRef.current) return
    didResetRef.current = true
    reset(
      receivable
        ? {
            amount: centsToInputText(receivable.amountCents),
            name: receivable.name,
            expectedPeriod: receivable.expected_period?.slice(0, 7) ?? '',
            saldoOption: saldoOptionFromReceivable(receivable),
            expenseCategoryId: '',
            expenseOccurredOn: format(new Date(), 'yyyy-MM-dd'),
            expenseAccountId: '',
            note: receivable.note ?? '',
          }
        : {
            amount: '',
            name: '',
            expectedPeriod: '',
            saldoOption: defaultAlreadyExpensed ? 'ya_gastado' : 'sigue',
            expenseCategoryId: '',
            expenseOccurredOn: format(new Date(), 'yyyy-MM-dd'),
            expenseAccountId: '',
            note: '',
          },
    )
  }, [open, receivable, defaultAlreadyExpensed, reset])

  // Precarga la cuenta predeterminada del gasto de "Descontala ahora" — sólo ese campo, sólo una
  // vez por apertura, y nunca si el usuario ya la tocó (ver el comentario gemelo en
  // `TransactionFormDialog`).
  const appliedDefaultAccountRef = useRef(false)
  useEffect(() => {
    if (!open) {
      appliedDefaultAccountRef.current = false
      return
    }
    if (receivable || appliedDefaultAccountRef.current || !defaultAccountId || dirtyFields.expenseAccountId) return
    setValue('expenseAccountId', defaultAccountId)
    appliedDefaultAccountRef.current = true
  }, [open, receivable, defaultAccountId, dirtyFields.expenseAccountId, setValue])

  async function onSubmit(values: FormValues) {
    // El gasto que se genera al descontar es un movimiento nuevo: lleva cuenta como cualquiera.
    if (values.saldoOption === 'descontar' && picker.show && !values.expenseAccountId) {
      setError('expenseAccountId', { message: 'Elegí una cuenta' })
      return
    }
    const cents = parseAmountToCents(values.amount)!
    const payload = {
      name: values.name.trim(),
      cents,
      expectedPeriod: values.expectedPeriod ? `${values.expectedPeriod}-01` : null,
      alreadyExpensed: values.saldoOption !== 'sigue',
      note: values.note?.trim() || null,
      expense:
        values.saldoOption === 'descontar'
          ? {
              cents,
              categoryId: values.expenseCategoryId || null,
              occurredOn: values.expenseOccurredOn || format(new Date(), 'yyyy-MM-dd'),
              description: `Descontado: ${values.name.trim()}`,
              accountId: values.expenseAccountId || null,
            }
          : null,
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
        <Field label="Importe" error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        <Field label="Quién te debe" htmlFor="name" error={errors.name?.message}>
          <PersonNameInput id="name" placeholder="Juan, mi hermana…" invalid={!!errors.name} {...register('name')} />
        </Field>

        <Field label="Cuándo lo cobrás" htmlFor="expectedPeriod" hint="Opcional — para no olvidarte">
          <Input id="expectedPeriod" type="month" {...register('expectedPeriod')} />
        </Field>

        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="eyebrow">¿Qué pasa con tu saldo?</span>
            <InfoTooltip text="Si le diste efectivo, esa plata sigue siendo tuya hasta que te la devuelvan. Si querés descontarla ahora, la app carga el gasto en el momento. Si ya cargaste ese gasto vos mismo en otro lado, esa plata ya salió de tu saldo — cuando te la devuelvan se registra como un ingreso." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip
              active={saldoOption === 'sigue'}
              onClick={locked ? undefined : () => setValue('saldoOption', 'sigue')}
              className={locked ? 'opacity-50' : undefined}
            >
              Sigue en mi saldo
            </Chip>
            {/* Sólo en alta: editar no puede generar el gasto de forma atómica con el resto del
                patch (`useUpdateReceivable` es un update directo, no un RPC) — para descontar una
                deuda ya cargada existe el botón dedicado del detalle (`useExpenseReceivable`). */}
            {!isEditing && (
              <Chip
                active={saldoOption === 'descontar'}
                onClick={locked ? undefined : () => setValue('saldoOption', 'descontar')}
                className={locked ? 'opacity-50' : undefined}
              >
                Descontala ahora
              </Chip>
            )}
            <Chip
              active={saldoOption === 'ya_gastado'}
              onClick={locked ? undefined : () => setValue('saldoOption', 'ya_gastado')}
              className={locked ? 'opacity-50' : undefined}
            >
              Ya cargué el gasto
            </Chip>
          </div>
          {hasPayments && (
            <p className="mt-2 text-[12px] text-fg-muted">
              No se puede cambiar: ya registraste abonos con este criterio.
            </p>
          )}
          {lockedByExpense && !hasPayments && (
            <p className="mt-2 text-[12px] text-fg-muted">
              No se puede cambiar acá: "Descontala ahora" ya generó un gasto real. Para deshacerlo, usá
              "Deshacer descuento" en el detalle de la deuda.
            </p>
          )}

          {saldoOption === 'descontar' && (
            <div className="mt-3 flex flex-col gap-3 rounded-control bg-fill-subtle p-3">
              <Field label="Categoría del gasto" htmlFor="expenseCategoryId" hint="Opcional">
                <Select id="expenseCategoryId" {...register('expenseCategoryId')}>
                  <option value="">Elegir…</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha del gasto" htmlFor="expenseOccurredOn">
                <Input id="expenseOccurredOn" type="date" {...register('expenseOccurredOn')} />
              </Field>
              {picker.show && (
                <Field label="Con qué lo pagué" htmlFor="expenseAccountId" error={errors.expenseAccountId?.message}>
                  <AccountSelect
                    id="expenseAccountId"
                    required
                    value={watch('expenseAccountId') ?? ''}
                    onChange={(v) => setValue('expenseAccountId', v, { shouldDirty: true })}
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        <Field label="Nota" htmlFor="note" hint="Opcional">
          <Input id="note" placeholder="Me lo devuelve cuando cobre el aguinaldo…" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  )
}
