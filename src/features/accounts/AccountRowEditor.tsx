import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { cn } from '@/lib/cn'
import { parseAmountToCents } from '@/lib/money'
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

function KindChips({ value, onChange }: { value: AccountKind; onChange: (kind: AccountKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KINDS.map((kind) => (
        <Chip key={kind} active={value === kind} onClick={() => onChange(kind)}>
          {ACCOUNT_KIND_LABEL[kind]}
        </Chip>
      ))}
    </div>
  )
}

type AccountRowEditorProps =
  | {
      mode: 'create'
      /** "Cuánto tenés hoy" ya escrito — la primera cuenta viene con el saldo actual de la app para
       *  que crearla no lo mueva. */
      initialOpening?: string
      /** Sólo con al menos una cuenta hay a dónde volver; sin ninguna el alta no tiene "Cancelar". */
      onCancel?: () => void
      onDone: () => void
    }
  | { mode: 'edit'; location: BalanceLocation; onDone: () => void }

/**
 * Alta y edición de una cuenta (mismo formulario, distinta operación — decisiones 20a/21a/22b de
 * `design_handoff_rediseno_v2/DECISIONES.md`). El alta pide "¿Cuánto tenés hoy?", que queda como la
 * apertura de la cuenta; la edición sólo toca nombre y tipo: la apertura no se edita a mano en
 * ningún lado, después de crearla sólo cambia con "Reajustar saldo".
 *
 * El nombre sigue al tipo mientras el usuario no lo toque (`nameForKindChange`): Efectivo se
 * autocompleta "Efectivo"; Billetera y Banco piden el nombre.
 */
export function AccountRowEditor(props: AccountRowEditorProps) {
  const isCreate = props.mode === 'create'
  const createLocation = useCreateBalanceLocation()
  const updateLocation = useUpdateBalanceLocation()

  const [kind, setKind] = useState<AccountKind>(isCreate ? DEFAULT_NEW_ACCOUNT_KIND : props.location.kind)
  const [name, setName] = useState(isCreate ? DEFAULT_NEW_ACCOUNT_NAME : props.location.name)
  const [opening, setOpening] = useState(isCreate ? (props.initialOpening ?? '') : '0')
  const [error, setError] = useState<{ name?: string; opening?: string }>({})

  const pending = createLocation.isPending || updateLocation.isPending

  function changeKind(next: AccountKind) {
    setName((current) => nameForKindChange(kind, next, current))
    setKind(next)
  }

  async function submit() {
    const parsed = accountFormSchema.safeParse({ name, kind, opening })
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors
      setError({ name: fieldErrors.name?.[0], opening: fieldErrors.opening?.[0] })
      return
    }
    setError({})
    if (props.mode === 'create') {
      await createLocation.mutateAsync({
        name: parsed.data.name,
        kind: parsed.data.kind,
        openingCents: parseAmountToCents(parsed.data.opening)!,
      })
    } else {
      await updateLocation.mutateAsync({ id: props.location.id, name: parsed.data.name, kind: parsed.data.kind })
    }
    props.onDone()
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        isCreate
          ? 'mx-panel mt-2 mb-3 rounded-control border-l-2 border-accent bg-editing p-3.5'
          : 'mt-1 mb-3 ml-[43px] border-l border-border pl-4',
      )}
    >
      {isCreate && <p className="eyebrow">Nueva cuenta</p>}
      <KindChips value={kind} onChange={changeKind} />
      <Field label="Nombre" error={error.name}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          invalid={!!error.name}
          placeholder={ACCOUNT_KIND_NAME_PLACEHOLDER[kind]}
          maxLength={60}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
      {isCreate && (
        <>
          <OpeningAmountField
            label="¿Cuánto tenés hoy?"
            hint="Lo que hay en esta cuenta ahora. Después se corrige con Reajustar saldo."
            value={opening}
            onChange={setOpening}
            ariaLabel="Cuánto tenés hoy en la cuenta nueva"
          />
          {error.opening && <p className="text-[12px] text-negative">{error.opening}</p>}
        </>
      )}
      <div className="flex gap-2">
        {(props.mode === 'edit' || props.onCancel) && (
          <Button variant="ghost" onClick={props.mode === 'edit' ? props.onDone : props.onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button onClick={submit} disabled={pending} className="flex-1">
          {pending ? 'Guardando…' : isCreate ? 'Agregar cuenta' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
