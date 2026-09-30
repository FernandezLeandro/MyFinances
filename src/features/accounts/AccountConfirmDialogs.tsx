import { useState } from 'react'
import { Power, Trash2, Wallet } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import { DialogConfirmStack, DialogItemCard, DialogSaveError, DialogSummaryBlock } from '@/components/ui/dialog-parts'
import { formatMoney } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import type { BalanceLocation } from '@/features/accounts/api'
import { describeAccountDelete, stopUsingAccountsSummary } from '@/features/accounts/aggregate'
import { ACCOUNT_KIND_LABEL, accountKindIcon } from '@/features/accounts/accountKind'

interface DeleteAccountDialogProps {
  onClose: () => void
  account: BalanceLocation
  movimientos: number
  transferencias: number
  /** El saldo PROPIO de la cuenta — ver el comentario de `describeAccountDelete`. */
  balanceCents: number
  /** Mientras se cargan movimientos/saldo: el resumen dice "Calculando…" y el botón espera. */
  isCountPending: boolean
  /** Sólo si se puede archivar (no es la última cuenta activa): "Mejor archivar" es la salida
   *  amable para quien sólo quiere dejar de usarla. Archiva y cierra. */
  onArchive?: () => Promise<void>
  onConfirm: () => Promise<void>
}

type Busy = 'delete' | 'archive' | null

/** Eliminar se lleva SÓLO LO SUYO — su propio saldo y sus propios movimientos
 *  (`rpc_delete_account`, `20260923020001_eliminar_cuenta_solo_lo_suyo.sql`); si financió o recibió
 *  plata de otra cuenta por transferencia, esa otra queda exactamente igual. No se puede deshacer,
 *  así que siempre confirma y dice cuánto se borra. Lo que se pagó desde esta cuenta (fijos,
 *  tarjetas, deudas) sigue como pagado.
 *
 *  La última cuenta activa no llega a este diálogo: ni el menú `⋯` (`accountMenuEntries`) ni la
 *  edición ofrecen Eliminar sobre ella — la única salida es el interruptor «Cuentas» de Ajustes
 *  (`StopUsingAccountsDialog` más abajo).
 *
 *  Las dos salidas (Eliminar, Archivar) fallan adentro del diálogo, que no se cierra.
 *
 *  Rediseño de modales v2, confirmación «Pila». Con algo en juego (movimientos o saldo propio) no es
 *  un «¿seguro?» sino una elección: Archivar (recomendado, elegido de entrada) o Eliminar, y un solo
 *  botón cuyo texto y tono siguen a lo elegido. Sin nada en juego, Eliminar directo y «Mejor archivar»
 *  como salida de texto. */
export function DeleteAccountDialog({
  onClose,
  account,
  movimientos,
  transferencias,
  balanceCents,
  isCountPending,
  onArchive,
  onConfirm,
}: DeleteAccountDialogProps) {
  const [busy, setBusy] = useState<Busy>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [choice, setChoice] = useState<'archive' | 'delete'>('archive')

  const description = describeAccountDelete({ movimientos, transferencias, balanceCents, isArchived: account.is_archived })
  const recommendArchive = !!onArchive && description.recommendArchive

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind)
    setSaveError(null)
    try {
      await action()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    } finally {
      setBusy(null)
    }
  }

  const name = account.name || 'la cuenta'
  const KindIcon = accountKindIcon(account.kind)
  const empty = !isCountPending && movimientos + transferencias === 0
  const card = (
    <DialogItemCard
      leading={
        <span aria-hidden className="grid size-[38px] shrink-0 place-items-center rounded-[10px] bg-fill-subtle text-fg-secondary">
          <KindIcon className="size-[19px]" strokeWidth={1.8} />
        </span>
      }
      title={name}
      meta={`${ACCOUNT_KIND_LABEL[account.kind]}${empty ? ' · sin movimientos' : ''}`}
      amount={<Money cents={balanceCents} tone="fg" />}
    />
  )
  const consequence = 'Los fijos, tarjetas y deudas que pagaste con esta cuenta siguen como pagados. No se puede deshacer.'
  const deleting = !recommendArchive || choice === 'delete'
  const deleteLabel = busy === 'delete' ? 'Eliminando…' : saveError && busy === null && deleting ? 'Reintentar' : 'Eliminar cuenta'
  const errorBlock = saveError && <DialogSaveError title="No se pudo completar">{saveError}</DialogSaveError>

  if (recommendArchive && onArchive) {
    const options = [
      { id: 'archive' as const, name: 'Archivarla', badge: 'Recomendado', desc: 'Deja de sumar al saldo y no toca las otras cuentas. La reactivás cuando quieras.' },
      {
        id: 'delete' as const,
        name: 'Eliminarla',
        badge: null,
        desc: [description.summary, description.balanceChangeText, consequence].filter(Boolean).join(' '),
      },
    ]
    return (
      <Dialog
        open
        onClose={onClose}
        size="sm"
        ownsPending
        title={`¿Qué hacemos con ${name}?`}
        icon={<Wallet className="size-[19px]" strokeWidth={1.8} aria-hidden />}
        footer={
          <DialogConfirmStack
            tone={choice === 'delete' ? 'danger' : 'primary'}
            confirmLabel={choice === 'delete' ? deleteLabel : 'Archivar cuenta'}
            pendingLabel={busy === 'delete' ? 'Eliminando…' : 'Archivando…'}
            pending={busy !== null}
            disabled={choice === 'delete' && isCountPending}
            onConfirm={() => (choice === 'delete' ? run('delete', onConfirm) : run('archive', onArchive))}
            onCancel={onClose}
          />
        }
      >
        <div className="flex flex-col gap-3.5">
          {card}
          <div role="radiogroup" aria-label="Qué hacer con la cuenta" className="flex flex-col gap-2">
            {options.map((o) => (
              <label
                key={o.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-panel-sm p-3.5',
                  choice === o.id ? 'border-2 border-fg' : 'border border-border-strong',
                )}
              >
                <input
                  type="radio"
                  name="delete-account-choice"
                  checked={choice === o.id}
                  onChange={() => setChoice(o.id)}
                  disabled={busy !== null}
                  className="mt-0.5 size-[18px] shrink-0 accent-fg"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-fg">
                    {o.name}
                    {o.badge && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-text">{o.badge}</span>}
                  </span>
                  <span className="text-[12.5px] leading-normal text-fg-secondary text-pretty">
                    {o.id === 'delete' && isCountPending ? 'Calculando lo que se borra…' : o.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errorBlock}
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      ownsPending
      title={`¿Eliminar ${name}?`}
      icon={<Trash2 className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      tone="danger"
      footer={
        <DialogConfirmStack
          confirmLabel={deleteLabel}
          pendingLabel="Eliminando…"
          pending={busy === 'delete'}
          disabled={isCountPending || busy === 'archive'}
          onConfirm={() => run('delete', onConfirm)}
          onCancel={onClose}
          secondary={
            onArchive && (
              <Button
                variant="ghost"
                onClick={() => run('archive', onArchive)}
                disabled={busy !== null}
                loading={busy === 'archive'}
                className="h-11 w-full text-fg"
              >
                Mejor archivar
              </Button>
            )
          }
        />
      }
    >
      <div className="flex flex-col gap-3.5">
        {card}
        <div className="flex flex-col gap-2 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          <p>{isCountPending ? 'Calculando lo que se borra…' : description.summary}</p>
          <p>{consequence}</p>
        </div>
        {errorBlock}
      </div>
    </Dialog>
  )
}

interface StopUsingAccountsDialogProps {
  onClose: () => void
  /** El saldo actual de la app — el que va a quedar guardado como ajuste. */
  balanceCents: number
  accountCount: number
  isCountsPending: boolean
  onConfirm: () => Promise<void>
}

/** Desactivar Cuentas desde el interruptor de Ajustes (`rpc_stop_using_accounts`,
 *  `20260922030001_ultima_cuenta_activa.sql`): borra TODAS las cuentas, pero antes guarda el saldo de
 *  hoy como un ajuste y no toca ningún movimiento — la app vuelve a verse como antes de crear
 *  cuentas, sin perder nada. Es la única salida sobre la última cuenta activa (ver
 *  `DeleteAccountDialog` arriba). Falla adentro del diálogo, que no se cierra. */
export function StopUsingAccountsDialog({ onClose, balanceCents, accountCount, isCountsPending, onConfirm }: StopUsingAccountsDialogProps) {
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setSaveError(null)
    try {
      await onConfirm()
    } catch (error) {
      setSaveError(mensajeDeError(error))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      ownsPending
      title="¿Desactivar Cuentas?"
      icon={<Power className="size-[19px]" strokeWidth={1.8} aria-hidden />}
      tone="danger"
      footer={
        <DialogConfirmStack
          confirmLabel={saveError && !busy ? 'Reintentar' : 'Desactivar Cuentas'}
          pendingLabel="Desactivando…"
          pending={busy}
          disabled={isCountsPending}
          onConfirm={confirm}
          onCancel={onClose}
        />
      }
    >
      <div className="flex flex-col gap-3.5">
        <DialogSummaryBlock
          title="Tu saldo de hoy queda como ajuste"
          hint="Conservamos todos tus movimientos"
          figure={isCountsPending ? '…' : formatMoney(balanceCents)}
        />
        <p className="text-[13px] leading-[1.55] text-fg-secondary text-pretty">
          {stopUsingAccountsSummary(accountCount)} La app vuelve a verse como antes de crear cuentas.
        </p>
        {saveError && <DialogSaveError title="No se pudo completar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
