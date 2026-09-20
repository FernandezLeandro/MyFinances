import { useState } from 'react'
import type { FormEvent } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError, DialogSummaryBlock } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { formatMoney, parseAmountToCents } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import {
  useCreateBalanceLocation,
  useUpdateBalanceLocation,
  type AccountKind,
  type BalanceLocation,
} from '@/features/accounts/api'
import {
  DEFAULT_NEW_ACCOUNT_KIND,
  DEFAULT_NEW_ACCOUNT_NAME,
  accountFormSchema,
  nameForKindChange,
} from '@/features/accounts/aggregate'
import { ACCOUNT_KIND_LABEL, ACCOUNT_KIND_NAME_PLACEHOLDER } from '@/features/accounts/accountKind'

const KINDS: AccountKind[] = ['cash', 'wallet', 'bank']

type AccountFormDialogProps = { onClose: () => void } & (
  | {
      mode: 'create'
      /** "Cuánto tenés hoy" ya escrito — la primera cuenta viene con el saldo actual de la app para
       *  que crearla no lo mueva. */
      initialOpening?: string
      /** Sólo para la primera cuenta: aclara de dónde sale el importe precargado. */
      firstAccountNote?: boolean
    }
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

  const [kind, setKind] = useState<AccountKind>(isCreate ? DEFAULT_NEW_ACCOUNT_KIND : props.account.kind)
  const [name, setName] = useState(isCreate ? DEFAULT_NEW_ACCOUNT_NAME : props.account.name)
  const [opening, setOpening] = useState(isCreate ? (props.initialOpening ?? '') : '0')
  const [touched, setTouched] = useState({ name: false, opening: false })
  const [saveError, setSaveError] = useState<string | null>(null)

  const pending = createLocation.isPending || updateLocation.isPending
  const parsed = accountFormSchema.safeParse({ name, kind, opening })
  const fieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors
  // El mensaje aparece cuando el campo ya se tocó: un alta recién abierta no arranca en rojo.
  const nameError = touched.name ? fieldErrors.name?.[0] : undefined
  const openingError = isCreate && touched.opening ? fieldErrors.opening?.[0] : undefined
  const canSubmit = parsed.success && !pending

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
        await createLocation.mutateAsync({
          name: parsed.data.name,
          kind: parsed.data.kind,
          openingCents: parseAmountToCents(parsed.data.opening)!,
        })
        showToast('Cuenta agregada', 'ok', { detail: parsed.data.name })
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
        {props.mode === 'create' && props.firstAccountNote && (
          <p className="text-[13px] leading-normal text-fg-secondary text-pretty">
            Es tu saldo actual en la app. Si tu plata está repartida en varias cuentas, poné sólo lo de esta y después
            sumás las otras.
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
            hint="Lo que ya tenías antes de cargar el primer movimiento. Si no sabés, dejalo en cero y reajustá después."
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

        {saveError && (
          <DialogSaveError title={isCreate ? 'No se pudo agregar la cuenta' : 'No se pudo guardar la cuenta'}>
            {saveError} Tus datos siguen acá.
          </DialogSaveError>
        )}
      </form>
    </Dialog>
  )
}
