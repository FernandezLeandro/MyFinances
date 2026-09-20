import { useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError, DialogSummaryBlock } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useCurrentBalance } from '@/features/transactions/api'
import {
  useAccountBalances,
  useBalanceLocations,
  useCreateBalanceLocation,
  useUpdateBalanceLocation,
  type AccountKind,
  type BalanceLocation,
} from '@/features/accounts/api'
import {
  DEFAULT_NEW_ACCOUNT_KIND,
  DEFAULT_NEW_ACCOUNT_NAME,
  UNASSIGNED_ACCOUNT_NAME,
  accountFormSchema,
  accountsTotals,
  createAccountResultText,
  defaultFundingAccountId,
  firstAccountSplit,
  fundingError,
  nameForKindChange,
  newAccountEffect,
  type NewAccountSource,
} from '@/features/accounts/aggregate'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { ACCOUNT_KIND_LABEL, ACCOUNT_KIND_NAME_PLACEHOLDER } from '@/features/accounts/accountKind'

const KINDS: AccountKind[] = ['cash', 'wallet', 'bank']

type AccountFormDialogProps = { onClose: () => void } & (
  | { mode: 'create' }
  | {
      mode: 'edit'
      account: BalanceLocation
      /** Su saldo hoy, para el bloque de contexto. */
      balanceCents: number
      isDefault: boolean
      /** Pasa a la confirmación de eliminar (el diálogo actual se cierra). */
      onDelete: () => void
    }
)

/**
 * Alta y edición de una cuenta: el mismo formulario, distinta operación. El alta pide "cuánto tenés
 * hoy", que queda como la apertura; la edición sólo toca nombre y tipo — la apertura no se edita a
 * mano, después de crearla sólo cambia con "Reajustar saldo".
 *
 * Crear una cuenta no mueve el saldo salvo que el usuario lo diga. La primera viene con el saldo
 * actual de la app; si declara menos, el resto queda en una cuenta «Sin repartir» (o lo suelta con
 * "No los tengo"). Con cuentas ya cargadas, la apertura es plata nueva o sale de otra cuenta por una
 * transferencia. Lo resuelve `rpc_create_account`; acá se muestra en vivo qué le pasa al saldo.
 *
 * El nombre sigue al tipo mientras el usuario no lo toque (`nameForKindChange`): Efectivo se
 * autocompleta "Efectivo"; Billetera y Banco piden el nombre.
 *
 * Se monta sólo mientras está abierto (el padre lo pone y lo saca), así el estado arranca de cero
 * cada vez sin un `useEffect` que lo reinicie.
 *
 * Validación (patrón 5b): mientras el formulario no es válido el botón queda apagado y el mensaje va
 * al lado del campo; una falla al guardar va en un bloque arriba del pie, el diálogo no se cierra y
 * el botón pasa a "Reintentar".
 */
export function AccountFormDialog(props: AccountFormDialogProps) {
  const isCreate = props.mode === 'create'
  const createLocation = useCreateBalanceLocation()
  const updateLocation = useUpdateBalanceLocation()
  const { data: locations } = useBalanceLocations()
  const { data: balances } = useAccountBalances()
  const { data: currentBalanceCents } = useCurrentBalance()

  // De dónde sale la plata de una cuenta nueva. Sin cuentas: el saldo de la app, que el alta puede
  // dejar aparte o soltar. Con cuentas activas: plata nueva, o una transferencia desde otra.
  const all = locations ?? []
  const derivedCents = balances ?? new Map<string, number>()
  const hasAccounts = all.length > 0
  const isFirst = isCreate && !hasAccounts
  const canFund = isCreate && all.some((l) => !l.is_archived)
  const balanceCents = hasAccounts ? accountsTotals(all, derivedCents).totalCents : currentBalanceCents

  const [kind, setKind] = useState<AccountKind>(isCreate ? DEFAULT_NEW_ACCOUNT_KIND : props.account.kind)
  const [name, setName] = useState(isCreate ? DEFAULT_NEW_ACCOUNT_NAME : props.account.name)
  // La primera cuenta viene con el saldo actual de la app: crearla tal cual no mueve nada.
  const [opening, setOpening] = useState(() =>
    !isCreate ? '0' : !hasAccounts && currentBalanceCents !== undefined ? centsToInputText(currentBalanceCents) : '',
  )
  const [source, setSource] = useState<NewAccountSource>(hasAccounts ? 'new' : 'hold')
  const [fromId, setFromId] = useState(() => defaultFundingAccountId(all, derivedCents))
  const [touched, setTouched] = useState({ name: false, opening: false })
  const [saveError, setSaveError] = useState<string | null>(null)

  const pending = createLocation.isPending || updateLocation.isPending
  const parsed = accountFormSchema.safeParse({ name, kind, opening })
  const fieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors
  // El mensaje aparece cuando el campo ya se tocó: un alta recién abierta no arranca en rojo.
  const nameError = touched.name ? fieldErrors.name?.[0] : undefined
  const openingError = isCreate && touched.opening ? fieldErrors.opening?.[0] : undefined

  const openingCents = isCreate && parsed.success ? parseAmountToCents(parsed.data.opening) : null
  const split =
    isFirst && openingCents !== null && balanceCents !== undefined ? firstAccountSplit(openingCents, balanceCents) : null
  const holdRest = split?.kind === 'rest' && source === 'hold'
  const fromAccountId = canFund && source === 'from' ? fromId : undefined
  const fromName = fromAccountId ? (all.find((l) => l.id === fromAccountId)?.name ?? '') : null
  const sourceError = canFund ? fundingError(source, fromId, openingCents) : null
  const effect =
    openingCents !== null && balanceCents !== undefined
      ? newAccountEffect({
          hasAccounts,
          source,
          openingCents,
          balanceCents,
          accountName: parsed.success ? parsed.data.name : '',
          fromName: fromName ?? undefined,
        })
      : null
  const canSubmit = parsed.success && !pending && !sourceError

  function changeKind(next: AccountKind) {
    setName((current) => nameForKindChange(kind, next, current))
    setKind(next)
    setSaveError(null)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!parsed.success || pending) return
    setSaveError(null)
    try {
      if (props.mode === 'create') {
        const cents = parseAmountToCents(parsed.data.opening)!
        await createLocation.mutateAsync({
          name: parsed.data.name,
          kind: parsed.data.kind,
          openingCents: cents,
          holdRest,
          fromAccountId,
        })
        const { title, detail } = createAccountResultText({
          name: parsed.data.name,
          openingCents: cents,
          heldRestCents: holdRest && split ? split.restCents : 0,
          fromName,
        })
        showToast(title, 'ok', { detail })
      } else {
        await updateLocation.mutateAsync({ id: props.account.id, name: parsed.data.name, kind: parsed.data.kind })
        showToast('Cuenta actualizada', 'ok', { detail: parsed.data.name })
      }
      props.onClose()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    }
  }

  const primaryLabel = pending ? 'Guardando…' : saveError ? 'Reintentar' : isCreate ? 'Agregar cuenta' : 'Guardar'

  return (
    <Dialog
      open
      onClose={props.onClose}
      title={isCreate ? 'Nueva cuenta' : 'Editar cuenta'}
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar
          start={
            props.mode === 'edit' && (
              <button
                type="button"
                onClick={props.onDelete}
                disabled={pending}
                className="py-2.5 text-[12.5px] font-semibold text-negative hover:underline disabled:opacity-40"
              >
                Eliminar cuenta
              </button>
            )
          }
        >
          <Button variant="ghost" size="dialogFooter" onClick={props.onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" form="account-form" size="dialogFooter" disabled={!canSubmit} loading={pending}>
            {primaryLabel}
          </Button>
        </DialogFooterBar>
      }
    >
      <form id="account-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
        {props.mode === 'edit' && (
          <DialogSummaryBlock
            title={props.account.name || '(sin nombre)'}
            hint={`${props.isDefault ? 'Predeterminada · ' : ''}${ACCOUNT_KIND_LABEL[props.account.kind].toLowerCase()}`}
            figure={formatMoney(props.balanceCents)}
          />
        )}
        {isFirst && balanceCents !== undefined && balanceCents > 0 && (
          <p className="text-[13px] leading-normal text-fg-secondary text-pretty">
            Viene cargado tu saldo actual en la app. Si tu plata está repartida en varias cuentas, poné sólo lo de esta:
            el resto queda guardado para que lo repartas después.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="eyebrow">Tipo de cuenta</p>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k} size="md" active={kind === k} onClick={() => changeKind(k)}>
                {ACCOUNT_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Nombre" htmlFor="account-name" error={nameError}>
          <Input
            id="account-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaveError(null)
            }}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            invalid={!!nameError}
            placeholder={ACCOUNT_KIND_NAME_PLACEHOLDER[kind]}
            maxLength={60}
            autoComplete="off"
          />
        </Field>

        {props.mode === 'create' && (
          <OpeningAmountField
            label="Apertura"
            hint={
              fromAccountId
                ? `Sale de ${fromName || 'esa cuenta'}: se registra como una transferencia por este importe.`
                : isFirst && balanceCents !== undefined && balanceCents > 0
                  ? 'Lo que tenés hoy en esta cuenta, no en toda la app.'
                  : 'Lo que ya tenías antes de cargar el primer movimiento. Si no sabés, dejalo en cero y reajustá después.'
            }
            error={openingError}
            value={opening}
            onChange={(value) => {
              setOpening(value)
              setTouched((t) => ({ ...t, opening: true }))
              setSaveError(null)
            }}
            ariaLabel="Cuánto tenés hoy en la cuenta nueva"
          />
        )}

        {props.mode === 'create' && (split?.kind === 'rest' || canFund) && (
          <div className="flex flex-col gap-2">
            <p className="eyebrow">
              {split?.kind === 'rest' ? `¿Y los otros ${formatMoney(split.restCents)}?` : '¿De dónde sale esta plata?'}
            </p>
            <div className="flex flex-wrap gap-2">
              {split?.kind === 'rest' ? (
                <>
                  <Chip size="md" active={source === 'hold'} onClick={() => setSource('hold')}>
                    Dejarlos en «{UNASSIGNED_ACCOUNT_NAME}»
                  </Chip>
                  <Chip size="md" active={source === 'drop'} onClick={() => setSource('drop')}>
                    No los tengo
                  </Chip>
                </>
              ) : (
                <>
                  <Chip size="md" active={source === 'new'} onClick={() => setSource('new')}>
                    Es plata nueva
                  </Chip>
                  <Chip size="md" active={source === 'from'} onClick={() => setSource('from')}>
                    Sale de otra cuenta
                  </Chip>
                </>
              )}
            </div>
            {source === 'from' && canFund && (
              <Field label="Sale de" htmlFor="account-from" error={sourceError ?? undefined}>
                <AccountSelect
                  id="account-from"
                  required
                  value={fromId}
                  onChange={(id) => {
                    setFromId(id)
                    setSaveError(null)
                  }}
                />
              </Field>
            )}
          </div>
        )}

        {props.mode === 'create' && effect && (
          <p className="-mt-2 text-[12px] leading-normal text-fg-muted text-pretty">{effect.note}</p>
        )}

        {saveError && (
          <DialogSaveError title={isCreate ? 'No se pudo agregar la cuenta' : 'No se pudo guardar la cuenta'}>
            {saveError} Tus datos siguen acá.
          </DialogSaveError>
        )}
      </form>
    </Dialog>
  )
}
