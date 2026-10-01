import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format, parseISO } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogActions } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { formatMoney, parseAmountToCents } from '@/lib/money'
import { cycleContaining, cycleLabel } from '@/lib/cycle'
import { useCycleConfig } from '@/lib/useCycle'
import { useCategories, useCategoryUsageCounts } from '@/features/categories/api'
import { CategoryPicker } from '@/features/categories/CategoryPicker'
import { useDeleteReceivablePayment, useUnexpenseReceivable } from '@/features/receivables/api'
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
import { DateShortcuts } from '@/features/transactions/DateShortcuts'

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
}

export function TransactionFormDialog({ open, onClose, transaction }: TransactionFormDialogProps) {
  const isEditing = !!transaction
  const canCuentas = useCan('cuentas')
  // `true`: incluye archivadas — si el movimiento ya tenía una categoría que después se archivó, el
  // select tiene que poder seguir mostrándola (ver `categoriesForType` más abajo), o guardar sin
  // tocar nada le pisa la categoría en silencio.
  const { data: categories } = useCategories(true)
  const { data: categoryUsage } = useCategoryUsageCounts()
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const cycleConfig = useCycleConfig()
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
    },
  })

  const type = watch('type')
  const amount = watch('amount')
  const occurredOn = watch('occurredOn')
  const cycle = occurredOn ? cycleContaining(cycleConfig, parseISO(occurredOn)) : null

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
          }
        : {
            type: 'expense',
            amount: '',
            categoryId: '',
            occurredOn: format(new Date(), 'yyyy-MM-dd'),
            description: '',
            accountId: '',
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

  // Activas del tipo elegido, más la actual si está archivada — así no desaparece del select de
  // abajo al abrir para editar un movimiento viejo.
  const selectedCategoryId = watch('categoryId')
  const categoriesForType = (categories ?? []).filter(
    (c) => c.kind === type && (!c.is_archived || c.id === selectedCategoryId),
  )
  const totalCents = parseAmountToCents(amount)

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
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={isEditing ? 'Editar movimiento' : 'Nuevo movimiento'}
        icon={type === 'expense' ? <ArrowUpRight className="size-5" strokeWidth={2} aria-hidden /> : <ArrowDownLeft className="size-5" strokeWidth={2} aria-hidden />}
        tone={type === 'expense' ? 'danger' : 'accent'}
        subtitle={cycle && `Se suma al ciclo de ${cycleLabel(cycle)}`}
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
            <DialogActions onCancel={onClose}>
              <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isSubmitting || originLoading}>
              {isSubmitting
                ? 'Guardando…'
                : parseAmountToCents(amount)
                  ? `Guardar ${type === 'expense' ? 'gasto' : 'ingreso'} · ${formatMoney(parseAmountToCents(amount)!)}`
                  : `Guardar ${type === 'expense' ? 'gasto' : 'ingreso'}`}
              </Button>
            </DialogActions>
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
            <Chip
              size="lg"
              activeTone="danger"
              leading={<ArrowUpRight className="size-4" strokeWidth={2} aria-hidden />}
              active={type === 'expense'}
              onClick={locks.lockType ? undefined : () => selectType('expense')}
            >
              Gasto
            </Chip>
            <Chip
              size="lg"
              activeTone="accent"
              leading={<ArrowDownLeft className="size-4" strokeWidth={2} aria-hidden />}
              active={type === 'income'}
              onClick={locks.lockType ? undefined : () => selectType('income')}
            >
              Ingreso
            </Chip>
          </div>

          <Field label="Importe" error={errors.amount?.message}>
            <AmountInput invalid={!!errors.amount} disabled={locks.lockAmount} {...register('amount')} />
          </Field>

          <CategoryPicker
            categories={categoriesForType}
            usage={categoryUsage}
            value={watch('categoryId')}
            onChange={(id) => setValue('categoryId', id, { shouldDirty: true })}
          />

          <div className="flex flex-col gap-2">
            <span className="eyebrow">Fecha</span>
            <DateShortcuts
              value={occurredOn}
              onChange={(v) => setValue('occurredOn', v, { shouldDirty: true, shouldValidate: true })}
              today={todayISO()}
              min={MIN_OCCURRED_ON}
              max={todayISO()}
            />
            {errors.occurredOn && <p className="text-[12px] text-negative">{errors.occurredOn.message}</p>}
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
                balances={balances}
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
          transaction={transaction ?? null}
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
