import { useState } from 'react'
import type { ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { ArrowDown, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Dialog } from '@/components/ui/Dialog'
import { DialogActions, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { centsToInputText, formatMoney, parseAmountToCents, sanitizeAmountInput } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useAccountBalances, useBalanceLocations } from '@/features/accounts/api'
import { maxFromAccountCents, overdrawError } from '@/features/accounts/aggregate'
import { useCreateAccountTransfer } from '@/features/accounts/transfers-api'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { DateShortcuts } from '@/features/transactions/DateShortcuts'

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

type CardAccount = { name: string; balanceCents: number | undefined; icon: ReactNode } | null

/** Tarjeta «Sale de» / «Entra a»: la cuenta y cómo queda su saldo — el de hoy tachado y al lado el de
 *  después — apenas hay un importe válido. */
function AccountCard({ label, account, deltaCents }: { label: string; account: CardAccount; deltaCents: number | null }) {
  const after = account?.balanceCents !== undefined && deltaCents !== null ? account.balanceCents + deltaCents : null
  return (
    <span className="flex items-center gap-3">
      {account?.icon ?? <span aria-hidden className="size-10 shrink-0 rounded-control bg-fill-subtle" />}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[12px] font-semibold text-fg-secondary">{label}</span>
        <span className={cn('truncate text-[15px] font-semibold', !account && 'font-medium text-fg-muted')}>
          {account?.name ?? 'Elegí una cuenta'}
        </span>
      </span>
      {account?.balanceCents !== undefined && (
        <span className="flex shrink-0 flex-col items-end gap-px tabular-nums">
          {after !== null && <span className="text-[12px] text-fg-secondary line-through">{formatMoney(account.balanceCents)}</span>}
          <span className="text-[14px] font-semibold">{formatMoney(after ?? account.balanceCents)}</span>
        </span>
      )}
    </span>
  )
}

interface TransferDialogProps {
  onClose: () => void
  /** Cuenta de origen ya elegida (al transferir desde el menú de una cuenta). */
  fromAccountId?: string
}

/** Mover plata entre tus propias cuentas (sacar efectivo del banco, pasar a Mercado Pago…) — no es
 *  gasto ni ingreso, así que no mueve el saldo global. Ver `account_transfers` en la migración
 *  `cuentas_y_medios_de_pago`.
 *
 *  Rediseño de modales v2, Transferir «1»: de arriba hacia abajo — de dónde sale, cuánto, a dónde
 *  entra — con cómo queda cada saldo a la vista. La fecha va en atajos y la nota se abre a pedido.
 *
 *  Se monta sólo mientras está abierto: el formulario arranca de cero cada vez, con el origen que
 *  llegue por prop. El botón queda apagado hasta que el formulario es válido; una falla al guardar
 *  se muestra adentro y no cierra el diálogo. */
export function TransferDialog({ onClose, fromAccountId = '' }: TransferDialogProps) {
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const createTransfer = useCreateAccountTransfer()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

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
  const amount = watch('amount')
  const amountCents = parseAmountToCents(amount)
  const overdraw =
    fromLocation && fromBalanceCents !== undefined && amountCents !== null && amountCents > 0
      ? overdrawError(fromLocation.name, fromBalanceCents, amountCents)
      : null
  const maxCents = maxFromAccountCents(fromBalanceCents)
  // Cuánto mueve, para el "después" de cada tarjeta: sólo con un importe válido que la cuenta cubre.
  const deltaCents = amountCents !== null && amountCents > 0 && !overdraw ? amountCents : null
  // Un solo renglón de error bajo las tarjetas. El del importe espera a que haya algo escrito: un
  // formulario recién abierto no arranca en rojo.
  const amountError = amount.trim() ? (errors.amount?.message ?? overdraw ?? undefined) : undefined
  const fieldError = errors.fromAccountId?.message ?? errors.toAccountId?.message ?? amountError

  // "Dos cuentas distintas" es un error de Hacia aunque lo dispare cambiar Desde: RHF sólo revalida
  // el campo que cambió, así que se pide revalidar los dos.
  function pickAccount(field: 'fromAccountId' | 'toAccountId', accountId: string) {
    setValue(field, accountId, { shouldValidate: true, shouldDirty: true })
    void trigger(['fromAccountId', 'toAccountId'])
    setSaveError(null)
  }

  function swapAccounts() {
    const from = watch('fromAccountId')
    setValue('fromAccountId', watch('toAccountId'), { shouldDirty: true })
    setValue('toAccountId', from, { shouldDirty: true })
    void trigger(['fromAccountId', 'toAccountId'])
    setSaveError(null)
  }

  function setAmount(value: string) {
    setValue('amount', value, { shouldValidate: true, shouldDirty: true })
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

  const primaryLabel = isSubmitting
    ? 'Transfiriendo…'
    : saveError
      ? 'Reintentar'
      : deltaCents !== null
        ? `Transferir ${formatMoney(deltaCents)}`
        : 'Transferir'

  return (
    <Dialog
      open
      onClose={onClose}
      title="Transferir"
      ownsPending
      footer={
        <DialogActions onCancel={onClose} cancelDisabled={isSubmitting}>
          <Button
            type="submit"
            form="transfer-form"
            size="dialogFooter"
            disabled={!hasEnoughAccounts || !isValid || !!overdraw}
            loading={isSubmitting}
          >
            {primaryLabel}
          </Button>
        </DialogActions>
      }
    >
      {!hasEnoughAccounts ? (
        <p className="text-[13px] text-fg-muted">Necesitás al menos dos cuentas para transferir entre ellas.</p>
      ) : (
        <form id="transfer-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-[18px]" noValidate>
          <div className="flex flex-col">
            <AccountSelect
              id="fromAccountId"
              required
              value={watch('fromAccountId')}
              onChange={(v) => pickAccount('fromAccountId', v)}
              balances={balances}
              trigger={(account) => (
                <AccountCard label="Sale de" account={account} deltaCents={deltaCents === null ? null : -deltaCents} />
              )}
              triggerClassName="rounded-t-float rounded-b-md border border-border bg-surface p-3.5 hover:border-border-strong"
            />
            <div className="relative flex flex-col items-center border-x border-border px-3.5 pt-9 pb-6">
              <label htmlFor="transfer-amount" className="absolute top-2.5 left-3.5 text-[12px] font-semibold text-fg-secondary">
                Importe
              </label>
              {maxCents !== null && (
                <button
                  type="button"
                  onClick={() => setAmount(centsToInputText(maxCents))}
                  title={formatMoney(maxCents)}
                  aria-label={`Usar todo: ${formatMoney(maxCents)}`}
                  className="absolute top-2 right-3 h-7 rounded-pill border border-border-strong px-2.5 text-[12px] font-semibold text-fg hover:bg-fill-subtle"
                >
                  Todo
                </button>
              )}
              <div
                className={cn('flex max-w-full items-baseline gap-1.5 border-b-2 pb-1', amountError ? 'border-negative' : 'border-accent')}
              >
                <span aria-hidden className="font-display text-[22px] font-medium text-fg-muted">
                  $
                </span>
                <input
                  id="transfer-amount"
                  value={amount}
                  onChange={(e) => setAmount(sanitizeAmountInput(e.target.value, { allowNegative: false }))}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-invalid={amountError ? true : undefined}
                  // El ancho sigue a lo escrito: el subrayado queda bajo la cifra, no a todo el ancho.
                  style={{ width: `${Math.max(amount.length, 4) + 1}ch` }}
                  className="tnum max-w-full min-w-0 bg-transparent text-center font-display text-[34px] leading-tight font-semibold tracking-[-0.04em] text-fg outline-none placeholder:text-fg-faint"
                />
              </div>
              <button
                type="button"
                onClick={swapAccounts}
                aria-label="Invertir cuentas"
                title="Invertir cuentas"
                className="absolute -bottom-[17px] left-1/2 z-[1] grid size-[34px] -translate-x-1/2 place-items-center rounded-full border border-border-strong bg-surface text-fg hover:bg-fill-subtle"
              >
                <ArrowDown className="size-4" strokeWidth={2.2} aria-hidden />
              </button>
            </div>
            <AccountSelect
              id="toAccountId"
              required
              value={watch('toAccountId')}
              onChange={(v) => pickAccount('toAccountId', v)}
              balances={balances}
              trigger={(account) => <AccountCard label="Entra a" account={account} deltaCents={deltaCents} />}
              triggerClassName="rounded-t-md rounded-b-float border border-border bg-surface p-3.5 hover:border-border-strong"
            />
            {fieldError && <p className="mt-2 text-[12px] text-negative">{fieldError}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateShortcuts
              value={watch('occurredOn')}
              onChange={(v) => setValue('occurredOn', v, { shouldValidate: true, shouldDirty: true })}
              today={format(new Date(), 'yyyy-MM-dd')}
            />
            {!noteOpen && (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="ml-auto flex h-9 items-center gap-1.5 px-1 text-[13px] font-semibold text-fg-secondary hover:text-fg"
              >
                <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
                Nota
              </button>
            )}
          </div>
          {noteOpen && (
            <Input
              autoFocus
              autoComplete="off"
              maxLength={140}
              aria-label="Nota"
              placeholder="Retiro del cajero…"
              {...register('description')}
            />
          )}

          <p className="-mt-1 text-[12.5px] leading-normal text-fg-secondary text-pretty">
            No es gasto ni ingreso: el total no cambia, sólo cambia de lugar.
          </p>

          {saveError && (
            <DialogSaveError title="No se pudo hacer la transferencia">{saveError} Tus datos siguen acá.</DialogSaveError>
          )}
        </form>
      )}
    </Dialog>
  )
}
