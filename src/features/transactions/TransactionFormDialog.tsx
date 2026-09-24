import { useEffect, useRef, useState } from 'react'
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
import { useCreateReceivable, useDeleteReceivablePayment, useUnexpenseReceivable } from '@/features/receivables/api'
import { PersonNameInput } from '@/features/receivables/PersonNameInput'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { accountFieldMode, accountNameOf, effectiveDefaultAccountId, overdraftNote } from '@/features/accounts/aggregate'
import { useUnmarkWithLegacyConfirm } from '@/features/fixed-expenses/api'
import { UnmarkBeforeAccountsDialog } from '@/features/fixed-expenses/UnmarkBeforeAccountsDialog'
import { ConfirmDeleteMovementDialog } from '@/features/transactions/ConfirmDeleteMovementDialog'
import { useUnmarkCreditCardPaid, useUnmarkCreditPurchasePaid } from '@/features/credits/api'
import { useCan } from '@/features/access/useCan'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactionOrigin,
  useUpdateTransaction,
  type Transaction,
  type TransactionType,
} from '@/features/transactions/api'
import { movementFieldLocks, originDeleteAction, originDeleteCopy, type TransactionOrigin } from '@/features/transactions/origin'

/** Cómo se calcula la parte de la otra persona en un gasto compartido. */
type SplitMode = '50' | 'percent' | 'amount'

/** MO-16 del QA de Movimientos: sin tope, `2030-01-01` o `0001-01-01` se guardaban sin aviso. */
const MIN_OCCURRED_ON = '2000-01-01'

/** Fecha local de hoy, en `yyyy-MM-dd` — se recalcula en cada parseo/render, no es una constante de
 *  módulo, así que no queda "vieja" si el diálogo sigue abierto al cruzar la medianoche. */
function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

const schema = z
  .object({
    type: z.enum(['income', 'expense']),
    amount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
      // MO-12 del QA de Movimientos: sin un ejemplo, un formato ambiguo ("1,234.56") pasaba la
      // validación de otra forma (con la coma como decimal) y se guardaba mal, sin que nada avisara
      // qué formato se esperaba.
      message: 'Ingresá un importe válido (ej. 1.234,56)',
    }),
    categoryId: z.string(),
    occurredOn: z
      .string()
      .min(1, 'Falta la fecha')
      .refine((v) => v >= MIN_OCCURRED_ON, { message: 'La fecha no puede ser anterior al 2000' })
      .refine((v) => v <= todayISO(), { message: 'No podés cargar una fecha futura' }),
    description: z.string().max(300, 'Como mucho 300 caracteres').optional(),
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
}

const emptySplitDefaults = {
  compartido: false,
  personName: '',
  splitMode: '50' as SplitMode,
  splitPercent: '',
  splitAmount: '',
  splitExpectedPeriod: '',
}

export function TransactionFormDialog({ open, onClose, transaction }: TransactionFormDialogProps) {
  const isEditing = !!transaction
  const canCuentas = useCan('cuentas')
  const canCompartido = useCan('compartido')
  // `true`: incluye archivadas — si el movimiento ya tenía una categoría que después se archivó, el
  // select tiene que poder seguir mostrándola (ver `categoriesForType` más abajo), o guardar sin
  // tocar nada le pisa la categoría en silencio.
  const { data: categories } = useCategories(true)
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const defaultAccountId = effectiveDefaultAccountId(locations ?? [])
  const activeAccountCount = (locations ?? []).filter((l) => !l.is_archived).length
  // `required`: todo movimiento nuevo lleva cuenta (el saldo es la suma de las cuentas). `legacy`: un
  // movimiento viejo sin cuenta que se edita — no se le pide una, asignársela contaría esa plata dos
  // veces (ya está en la apertura de las cuentas). `hidden`: plan sin Cuentas, o todavía sin ninguna.
  const accountMode = accountFieldMode({
    canCuentas,
    activeCount: activeAccountCount,
    isEditing,
    txAccountId: transaction?.account_id ?? null,
  })
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
  const deleteTx = useDeleteTransaction()
  const createReceivable = useCreateReceivable()
  // N4 del QA: borrar el movimiento de un pago de fijo anterior a las cuentas (`accountMode ===
  // 'legacy'`) tiene que pasar por el mismo freno que desmarcarlo desde Fijos — antes se borraba con
  // un toque, sólo con una nota. Se resuelve como "quitar el pago" (mismo RPC, mismo resultado neto:
  // se va el movimiento y el fijo vuelve a pendiente), no como un `deleteTx` distinto.
  const unmarkLegacyPayment = useUnmarkWithLegacyConfirm({ onSuccess: onClose })
  // Bloque 3 del arreglo de Movimientos (MO-02, MO-04, MO-05, MO-06): las mismas RPC de "deshacer"
  // que ya usan Mis Deudas y Me Deben, para que Eliminar acá nunca deje el origen desincronizado.
  const unmarkCardPayment = useUnmarkCreditCardPaid()
  const unmarkInstallment = useUnmarkCreditPurchasePaid()
  const unexpenseReceivable = useUnexpenseReceivable()
  const deleteReceivablePayment = useDeleteReceivablePayment()
  // Bloque 2 del arreglo de Movimientos: una sola consulta reemplaza a la vieja
  // `useFixedExpenseSavingByTransaction` (que sólo sabía de fijos) — sólo corre editando, y ni
  // siquiera ahí cuando ya se sabe gratis que es el pago de un fijo (`fixed_expense_payment_id` viene
  // en la fila, sin consultar nada).
  const originQuery = useTransactionOrigin(transaction && !transaction.fixed_expense_payment_id ? transaction.id : null)
  const origin: TransactionOrigin | null = !transaction
    ? null
    : transaction.fixed_expense_payment_id
      ? { kind: 'fixed_payment' }
      : (originQuery.data ?? null)
  // Mientras el origen todavía no resolvió (sólo aplica editando: al crear, la consulta ni corre),
  // Guardar/Eliminar quedan deshabilitados — mostrar el form sin saber si hay que bloquear el importe
  // sería peor que esperar el instante que tarda esta consulta.
  const originLoading = isEditing && !transaction?.fixed_expense_payment_id && originQuery.isPending
  const linkedKind: 'payment' | 'saving' | null =
    origin?.kind === 'fixed_payment' ? 'payment' : origin?.kind === 'fixed_saving' ? 'saving' : null
  const locks = movementFieldLocks(origin ?? { kind: 'plain' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
            type: 'expense',
            amount: '',
            categoryId: '',
            occurredOn: format(new Date(), 'yyyy-MM-dd'),
            description: '',
            accountId: '',
            ...emptySplitDefaults,
          },
    )
  }, [open, transaction, reset])

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
    if (transaction || appliedDefaultAccountRef.current || !defaultAccountId || dirtyFields.accountId || accountMode !== 'required') return
    setValue('accountId', defaultAccountId)
    appliedDefaultAccountRef.current = true
  }, [open, transaction, defaultAccountId, dirtyFields.accountId, accountMode, setValue])

  // El mes esperado de cobro arranca en el mes de la fecha del movimiento — es el caso dominante
  // (le pagás algo hoy, te lo devuelve más o menos este mes) y hace que la deuda caiga directo en el
  // mes en curso de Me Deben sin que el usuario tenga que completar nada más.
  useEffect(() => {
    if (!compartido) return
    setValue('splitExpectedPeriod', occurredOn ? occurredOn.slice(0, 7) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compartido])

  // Activas del tipo elegido, más la actual si está archivada — así no desaparece del select de
  // abajo al abrir para editar un movimiento viejo.
  const selectedCategoryId = watch('categoryId')
  const categoriesForType = (categories ?? []).filter(
    (c) => c.kind === type && (!c.is_archived || c.id === selectedCategoryId),
  )
  const totalCents = parseAmountToCents(amount)
  const otroCents =
    compartido && totalCents != null
      ? computeOtroCents({ splitMode, splitPercent: watch('splitPercent'), splitAmount: watch('splitAmount'), amount }, totalCents)
      : null
  const miParteCents = totalCents != null && otroCents != null ? totalCents - otroCents : null

  // Bloque 6 del arreglo de Movimientos (D4, MO-14): un aviso, no un bloqueo, cuando cargar o editar
  // un gasto deja la cuenta elegida en negativo — mismo criterio que ya usa `TransferDetailDialog`
  // para una transferencia, pero acá sin frenar el guardado.
  const accountId = watch('accountId')
  const overdraft =
    accountMode === 'required' && totalCents != null
      ? overdraftNote({
          type,
          accountId: accountId || null,
          cents: totalCents,
          balances,
          nameOf: (id) => accountNameOf(new Map((locations ?? []).map((l) => [l.id, l])), id),
          original: transaction ? { accountId: transaction.account_id, type: transaction.type, cents: transaction.cents } : null,
        })
      : null

  async function onSubmit(values: FormValues) {
    if (accountMode === 'required' && !values.accountId) {
      setError('accountId', { message: 'Elegí una cuenta' })
      return
    }
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
        // no salió de tu saldo — sigue contando como plata tuya hasta que te la devuelvan (ver la tabla de verificación de `deudas_flujo_movimientos`).
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

  function onDelete() {
    if (!transaction) return
    // FI-03/FI-05 del QA de Fijos: antes, un movimiento vinculado a un fijo se borraba al instante.
    // MO-01 del QA de Movimientos: un movimiento suelto tenía el mismo problema — ahora los dos
    // pasan por `ConfirmDeleteMovementDialog` primero. El freno `payment_before_accounts` (legacy)
    // sigue siendo aparte: lo dispara `unmarkLegacyPayment` recién al confirmar, si corresponde.
    setConfirmingDelete(true)
  }

  // Bloque 3 del arreglo de Movimientos: cada origen deshace su propio vínculo con la RPC que ya usa
  // su pantalla, en vez de un `delete` directo que dejaba una tarjeta/cuota "pagada" o una deuda
  // "descontada" sin el movimiento real detrás (MO-02, MO-04, MO-05, MO-06). `.mutate()` en todos los
  // casos, no `mutateAsync` + `await`: mismo motivo de siempre — si la base lo rechaza, awaitar acá
  // dejaría una promesa rechazada sin manejar en la consola (FI-11).
  function confirmDelete() {
    setConfirmingDelete(false)
    if (!transaction) return

    if (transaction.fixed_expense_payment_id) {
      unmarkLegacyPayment.unmarkPayment(transaction.fixed_expense_payment_id)
      return
    }

    switch (originDeleteAction(origin ?? { kind: 'plain' })) {
      case 'deleteFixedSaving':
        // Un mes ya pagado lo frena el trigger `transactions_block_delete_paid_saving`, con su
        // propio toast (`errors.ts`).
        deleteTx.mutate(transaction.id, { onSuccess: onClose })
        return
      case 'unmarkCardPayment': {
        const card = origin as Extract<TransactionOrigin, { kind: 'card_payment' }>
        unmarkCardPayment.mutate({ cardId: card.cardId, period: card.period }, { onSuccess: onClose })
        return
      }
      case 'unmarkInstallment': {
        const installment = origin as Extract<TransactionOrigin, { kind: 'installment' }>
        unmarkInstallment.mutate({ purchaseId: installment.purchaseId, period: installment.period }, { onSuccess: onClose })
        return
      }
      case 'unexpenseReceivable': {
        const receivable = origin as Extract<TransactionOrigin, { kind: 'receivable_expensed' }>
        unexpenseReceivable.mutate(receivable.receivableId, { onSuccess: onClose })
        return
      }
      case 'deleteReceivablePayment': {
        const payment = origin as Extract<TransactionOrigin, { kind: 'receivable_payment' }>
        deleteReceivablePayment.mutate(payment.paymentId, { onSuccess: onClose })
        return
      }
      case 'unmarkFixedPayment':
        // No debería llegar acá: `transaction.fixed_expense_payment_id` ya lo cubrió arriba. Se deja
        // por completitud del switch, no por un caso real.
        return
      case 'delete':
      default:
        // Tu parte de un gasto compartido, un ajuste (no debería llegar: ver `MovementDetailDialog`)
        // o un movimiento suelto: delete directo.
        deleteTx.mutate(transaction.id, { onSuccess: onClose })
    }
  }

  function selectType(next: TransactionType) {
    if (next === type || linkedKind) return
    setValue('type', next)
    setValue('categoryId', '') // la categoría elegida ya no aplica al otro tipo
    // MO-09 del QA de Movimientos: el bloque Compartido sólo se MUESTRA para `type === 'expense'`,
    // pero `compartido` seguía en `true` en el estado del form — al guardar como Ingreso, el split
    // armado desaparecía sin avisar. Se apaga acá para que el estado sea consistente con lo que se ve.
    if (next === 'income' && compartido) setValue('compartido', false)
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={isEditing ? 'Editar movimiento' : 'Nuevo movimiento'}
        footer={
          <>
            {isEditing && (
              <Button
                variant="danger"
                size="dialogFooter"
                onClick={onDelete}
                disabled={
                  originLoading ||
                  deleteTx.isPending ||
                  unmarkLegacyPayment.isPending ||
                  unmarkCardPayment.isPending ||
                  unmarkInstallment.isPending ||
                  unexpenseReceivable.isPending ||
                  deleteReceivablePayment.isPending
                }
                className="sm:mr-auto"
              >
                Eliminar
              </Button>
            )}
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isSubmitting || originLoading}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          {/* Bloque 1 del QA de Fijos (FI-02/FI-03) y Bloque 4 del arreglo de Movimientos
              (MO-03/MO-07/MO-08): qué se puede tocar sale de `movementFieldLocks(origin)` — un pago o
              un guardado de fijo deja el importe editable (lo sincroniza el trigger
              `transactions_sync_linked_fixed_expense`); el resto de los orígenes vinculados (tarjeta,
              cuota, deuda) bloquea también el importe, porque acá no hay ningún trigger que reparta
              ese cambio del lado del origen. Eliminar pide confirmar en `ConfirmDeleteMovementDialog`
              (montado más abajo) en vez de borrar directo — antes pasaba sin aviso (N4/FI-03/FI-05 del
              QA; MO-01 extendió la misma confirmación a cualquier movimiento suelto). */}
          {isEditing && locks.note && (
            <p className="text-[12px] text-fg-muted">
              {locks.note}
              {/* Antes de este bloque, este agregado no distinguía pago/guardado — se mantiene igual
                  (no sólo para `linkedKind === 'payment'`) para no regresar ese comportamiento. */}
              {linkedKind &&
                accountMode === 'legacy' &&
                ' Es de antes de tus cuentas: si después lo volvés a pagar, se descuenta dos veces.'}
            </p>
          )}

          <div className="flex gap-2">
            <Chip size="lg" active={type === 'expense'} onClick={locks.lockType ? undefined : () => selectType('expense')}>
              Gasto
            </Chip>
            <Chip size="lg" active={type === 'income'} onClick={locks.lockType ? undefined : () => selectType('income')}>
              Ingreso
            </Chip>
          </div>

          <Field label="Importe" error={errors.amount?.message}>
            <AmountInput invalid={!!errors.amount} disabled={locks.lockAmount} {...register('amount')} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoría" htmlFor="categoryId" hint="Opcional">
              <Select id="categoryId" {...register('categoryId')}>
                <option value="">Sin categoría</option>
                {categoriesForType.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_archived && ' (archivada)'}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
              <Input
                id="occurredOn"
                type="date"
                min={MIN_OCCURRED_ON}
                max={todayISO()}
                invalid={!!errors.occurredOn}
                {...register('occurredOn')}
              />
            </Field>
          </div>

          {accountMode === 'required' && (
            <Field label="Cuenta" htmlFor="accountId" error={errors.accountId?.message}>
              <AccountSelect
                id="accountId"
                required
                value={watch('accountId') ?? ''}
                // `shouldDirty`: sin esto, el guard de `dirtyFields.accountId` que evita que el prefill
                // de la predeterminada pise una elección manual no vería esta elección como manual.
                onChange={(v) => setValue('accountId', v, { shouldDirty: true })}
              />
            </Field>
          )}
          {accountMode === 'legacy' && (
            <p className="text-[12px] text-fg-muted">Movimiento anterior a tus cuentas: no suma al saldo actual.</p>
          )}
          {overdraft && <p className="text-[12px] text-negative">{overdraft}</p>}

          <Field label="Descripción" htmlFor="description" hint="Opcional" error={errors.description?.message}>
            {/* MO-10 del QA de Movimientos: sin `maxLength` ni `error` conectado, pasarse de 300
                caracteres (el mismo tope que ya usa `left(v_description, 300)` en
                `rpc_mark_credit_card_paid`) dejaba Guardar sin hacer nada, sin ninguna pista de por
                qué — el caso más fácil de pisar sin querer era heredar una descripción larga de un
                pago de tarjeta y sólo cambiarle la categoría. */}
            <Input id="description" autoComplete="off" maxLength={300} invalid={!!errors.description} {...register('description')} />
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
      <UnmarkBeforeAccountsDialog
        action="delete"
        open={unmarkLegacyPayment.confirmOpen}
        busy={unmarkLegacyPayment.isPending}
        onClose={unmarkLegacyPayment.cancelConfirm}
        onConfirm={unmarkLegacyPayment.confirmForce}
      />
      {transaction && (
        <ConfirmDeleteMovementDialog
          open={confirmingDelete}
          busy={
            deleteTx.isPending ||
            unmarkLegacyPayment.isPending ||
            unmarkCardPayment.isPending ||
            unmarkInstallment.isPending ||
            unexpenseReceivable.isPending ||
            deleteReceivablePayment.isPending
          }
          copy={originDeleteCopy(origin ?? { kind: 'plain' }, transaction.description)}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
