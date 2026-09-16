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
import { Money } from '@/components/ui/Money'
import { parseAmountToCents } from '@/lib/money'
import { useCategories } from '@/features/categories/api'
import { useCreateReceivable } from '@/features/receivables/api'
import { PersonNameInput } from '@/features/receivables/PersonNameInput'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useBalanceLocations } from '@/features/reconciliation/api'
import { useCan } from '@/features/access/useCan'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
  type Transaction,
  type TransactionType,
} from '@/features/transactions/api'

/** Cómo se calcula la parte de la otra persona en un gasto compartido. */
type SplitMode = '50' | 'percent' | 'amount'

const schema = z
  .object({
    type: z.enum(['income', 'expense']),
    amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
      message: 'Ingresá un importe válido',
    }),
    categoryId: z.string(),
    occurredOn: z.string().min(1, 'Falta la fecha'),
    description: z.string().max(140).optional(),
    accountId: z.string().optional(),
    compartido: z.boolean(),
    personName: z.string().max(80).optional(),
    splitMode: z.enum(['50', 'percent', 'amount']),
    splitPercent: z.string().optional(),
    splitAmount: z.string().optional(),
    splitExpectedPeriod: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.compartido) return
    if (!values.personName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['personName'], message: 'Falta el nombre' })
    }
    const totalCents = parseAmountToCents(values.amount)
    const otroCents = computeOtroCents(values, totalCents)
    if (totalCents == null || otroCents == null || otroCents <= 0 || otroCents >= totalCents) {
      ctx.addIssue({ code: 'custom', path: ['splitAmount'], message: 'La parte del otro tiene que ser mayor a $0 y menor al total' })
    }
  })

type FormValues = z.infer<typeof schema>

/** Parte del otro en centavos según el modo elegido, o `null` si el input todavía no es válido.
 *  50%: `floor(total/2)` — determinístico y no pierde ningún centavo (la diferencia queda del lado
 *  de "tu parte", que es `total - otroCents`, nunca al revés). */
function computeOtroCents(
  values: Pick<FormValues, 'splitMode' | 'splitPercent' | 'splitAmount' | 'amount'>,
  totalCents: number | null,
): number | null {
  if (totalCents == null) return null
  if (values.splitMode === '50') return Math.floor(totalCents / 2)
  if (values.splitMode === 'percent') {
    const pct = Number(values.splitPercent)
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null
    return Math.round((totalCents * pct) / 100)
  }
  return parseAmountToCents(values.splitAmount ?? '')
}

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

const emptySplitDefaults = {
  compartido: false,
  personName: '',
  splitMode: '50' as SplitMode,
  splitPercent: '',
  splitAmount: '',
  splitExpectedPeriod: '',
}

export function TransactionFormDialog({ open, onClose, transaction, prefill }: TransactionFormDialogProps) {
  const isEditing = !!transaction
  const canCuentas = useCan('cuentas')
  const canCompartido = useCan('compartido')
  const { data: categories } = useCategories()
  const { data: locations } = useBalanceLocations()
  const defaultAccountId = locations?.find((l) => l.is_default)?.id ?? ''
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()
  const createReceivable = useCreateReceivable()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'expense',
      amount: '',
      categoryId: '',
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      accountId: '',
      ...emptySplitDefaults,
    },
  })

  const type = watch('type')
  const compartido = watch('compartido')
  const splitMode = watch('splitMode')
  const amount = watch('amount')
  const occurredOn = watch('occurredOn')

  // `didResetRef`: sin esto, `<StrictMode>` (activo en `main.tsx`) vuelve a invocar este efecto una
  // segunda vez en desarrollo apenas monta (mount → efectos → "desmonta" cleanups → remonta →
  // efectos de nuevo, aunque nada de las deps haya cambiado). Cuando `defaultAccountId` YA estaba
  // en caché al abrir (típico: recién marcaste una cuenta predeterminada en Cuentas y volviste a
  // Hoy), esa segunda pasada de ESTE reset llegaba DESPUÉS de que el efecto de abajo ya hubiera
  // precargado la cuenta, y la volvía a pisar con `accountId: ''` — el guard de ese efecto no lo
  // evitaba porque, desde su propio punto de vista, ya había hecho su trabajo una vez. Detectado
  // reproduciendo a mano el reporte de un usuario ("marco la ★ y en Nuevo movimiento sigue en 'Sin
  // asignar'"): con la cuenta recién creada la query ya estaba resuelta al montar, así que las dos
  // pasadas de Strict Mode caían las dos ANTES de que hubiera ninguna causa real para reabrir el
  // diálogo — un caso de laboratorio perfecto para este bug.
  const didResetRef = useRef(false)
  useEffect(() => {
    if (!open) {
      didResetRef.current = false
      return
    }
    if (didResetRef.current) return
    didResetRef.current = true
    reset(
      transaction
        ? {
            type: transaction.type,
            amount: centsToInputText(transaction.cents),
            categoryId: transaction.category_id ?? '',
            occurredOn: transaction.occurred_on,
            description: transaction.description ?? '',
            accountId: transaction.account_id ?? '',
            ...emptySplitDefaults,
          }
        : {
            type: prefill?.type ?? 'expense',
            amount: prefill ? centsToInputText(prefill.cents) : '',
            categoryId: '',
            occurredOn: format(new Date(), 'yyyy-MM-dd'),
            description: '',
            accountId: '',
            ...emptySplitDefaults,
          },
    )
  }, [open, transaction, prefill, reset])

  // Precarga la cuenta predeterminada en un alta nueva — sólo escribe el campo `accountId`, nunca
  // el resto del form, y sólo mientras el usuario no lo haya tocado (`dirtyFields`, que `setValue`
  // sin `shouldDirty` no marca) ni ya se haya aplicado una vez en esta apertura del diálogo. Así, si
  // `locations` resuelve después de que el usuario ya eligió una cuenta a mano (incluida "Sin
  // asignar", que también vale ''), esa elección no se pisa.
  const appliedDefaultAccountRef = useRef(false)
  useEffect(() => {
    if (!open) {
      appliedDefaultAccountRef.current = false
      return
    }
    if (transaction || appliedDefaultAccountRef.current || !defaultAccountId || dirtyFields.accountId || !canCuentas) return
    setValue('accountId', defaultAccountId)
    appliedDefaultAccountRef.current = true
  }, [open, transaction, defaultAccountId, dirtyFields.accountId, canCuentas, setValue])

  // El mes esperado de cobro arranca en el mes de la fecha del movimiento — es el caso dominante
  // (le pagás algo hoy, te lo devuelve más o menos este mes) y hace que la deuda caiga directo en
  // el grupo "Entra este mes" de Cuadrar Saldo sin que el usuario tenga que completar nada más.
  useEffect(() => {
    if (!compartido) return
    setValue('splitExpectedPeriod', occurredOn ? occurredOn.slice(0, 7) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compartido])

  const categoriesForType = (categories ?? []).filter((c) => c.kind === type)
  const totalCents = parseAmountToCents(amount)
  const otroCents =
    compartido && totalCents != null
      ? computeOtroCents({ splitMode, splitPercent: watch('splitPercent'), splitAmount: watch('splitAmount'), amount }, totalCents)
      : null
  const miParteCents = totalCents != null && otroCents != null ? totalCents - otroCents : null

  async function onSubmit(values: FormValues) {
    const cents = parseAmountToCents(values.amount)!
    const description = values.description?.trim() || null

    // Gasto compartido: una sola llamada a `useCreateReceivable`, que via `rpc_create_receivable`
    // crea el gasto de TU parte y la deuda de la otra persona atómicamente. No se llama además a
    // `useCreateTransaction` — sería la escritura doble que la migración `deudas_flujo_movimientos`
    // rechaza explícitamente (dos escrituras sueltas podrían cortarse a la mitad en esta PWA).
    if (values.type === 'expense' && values.compartido && !isEditing) {
      const otro = computeOtroCents(values, cents)!
      await createReceivable.mutateAsync({
        name: values.personName!.trim(),
        cents: otro,
        expectedPeriod: values.splitExpectedPeriod ? `${values.splitExpectedPeriod}-01` : null,
        // `false`: la app sólo registró tu parte como gasto, así que lo que quedó en deuda todavía
        // no salió de tu saldo — sigue contando como plata tuya en Cuadrar Saldo hasta que te la
        // devuelvan (ver la tabla de verificación de `deudas_flujo_movimientos`).
        alreadyExpensed: false,
        note: null,
        expense: {
          cents: cents - otro,
          categoryId: values.categoryId || null,
          occurredOn: values.occurredOn,
          description,
          accountId: values.accountId || null,
        },
      })
      onClose()
      return
    }

    const payload = {
      type: values.type,
      cents,
      occurredOn: values.occurredOn,
      categoryId: values.categoryId || null,
      description,
      accountId: values.accountId || null,
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
            <Button variant="danger" size="dialogFooter" onClick={onDelete} disabled={deleteTx.isPending} className="sm:mr-auto">
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
        {/* Simétrico a desmarcar desde Fijos (que borra el movimiento): un trigger en la base
            desmarca el fijo si este movimiento se borra desde acá (`fixed_expense_payment_fecha`,
            bloque 2). Sólo aviso, sin confirmación aparte — se borra con el mismo botón Eliminar. */}
        {isEditing && transaction.fixed_expense_payment_id && (
          <p className="text-[12px] text-fg-muted">
            Este movimiento viene de pagar un fijo: si lo eliminás, el fijo vuelve a quedar pendiente.
          </p>
        )}

        <div className="flex gap-2">
          <Chip size="lg" active={type === 'expense'} onClick={() => selectType('expense')}>
            Gasto
          </Chip>
          <Chip size="lg" active={type === 'income'} onClick={() => selectType('income')}>
            Ingreso
          </Chip>
        </div>

        <Field label="Importe" error={errors.amount?.message}>
          <AmountInput invalid={!!errors.amount} {...register('amount')} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Categoría" htmlFor="categoryId" hint="Opcional">
            <Select id="categoryId" {...register('categoryId')}>
              <option value="">Sin categoría</option>
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
        </div>

        {canCuentas && (
          <Field label="Cuenta" htmlFor="accountId" hint="Opcional">
            <AccountSelect
              id="accountId"
              value={watch('accountId') ?? ''}
              // `shouldDirty`: sin esto, el guard de `dirtyFields.accountId` que evita que el prefill
              // de la predeterminada pise una elección manual no vería esta elección como manual.
              onChange={(v) => setValue('accountId', v, { shouldDirty: true })}
            />
          </Field>
        )}

        <Field label="Descripción" htmlFor="description" hint="Opcional">
          <Input id="description" autoComplete="off" {...register('description')} />
        </Field>

        {/* Sólo en alta de un gasto: es el flujo del usuario que compra algo y paga la mitad —
            "1 gasto + 1 deuda en una sola pasada" en vez de cargar cada uno por separado. En edición
            no se ofrece: la deuda ya puede tener abonos propios, y desarmar el vínculo retroactivo
            entre un movimiento editado y una deuda ya existente es más confuso que útil. */}
        {type === 'expense' && !isEditing && canCompartido && (
          <div className="border-t border-fill-subtle pt-5">
            <Chip active={compartido} onClick={() => setValue('compartido', !compartido)}>
              Compartido
            </Chip>

            {compartido && (
              <div className="mt-4 flex flex-col gap-4">
                <Field label="Con quién" htmlFor="personName" error={errors.personName?.message}>
                  <PersonNameInput
                    id="personName"
                    placeholder="mi pareja, Juan…"
                    invalid={!!errors.personName}
                    {...register('personName')}
                  />
                </Field>

                <div>
                  <p className="eyebrow mb-2">Parte del otro</p>
                  <div className="flex gap-1.5">
                    <Chip active={splitMode === '50'} onClick={() => setValue('splitMode', '50')}>
                      50%
                    </Chip>
                    <Chip active={splitMode === 'percent'} onClick={() => setValue('splitMode', 'percent')}>
                      Otro %
                    </Chip>
                    <Chip active={splitMode === 'amount'} onClick={() => setValue('splitMode', 'amount')}>
                      Monto
                    </Chip>
                  </div>

                  {splitMode === 'percent' && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={99}
                      placeholder="Porcentaje, ej. 30"
                      className="mt-2"
                      {...register('splitPercent')}
                    />
                  )}
                  {splitMode === 'amount' && (
                    <AmountInput className="mt-2" placeholder="0,00" {...register('splitAmount')} />
                  )}
                  {errors.splitAmount?.message && (
                    <p className="mt-2 text-[12px] text-negative">{errors.splitAmount.message}</p>
                  )}
                </div>

                <Field label="Cuándo lo cobrás" htmlFor="splitExpectedPeriod" hint="Opcional — para no olvidarte">
                  <Input id="splitExpectedPeriod" type="month" {...register('splitExpectedPeriod')} />
                </Field>

                {miParteCents != null && otroCents != null && (
                  <p className="text-[13px] text-fg-muted">
                    Gasto <Money cents={miParteCents} tone="dim" size="inline" /> (tu parte) · Deuda{' '}
                    <Money cents={otroCents} tone="accent" size="inline" />
                    {watch('personName')?.trim() ? ` ${watch('personName')!.trim()}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
