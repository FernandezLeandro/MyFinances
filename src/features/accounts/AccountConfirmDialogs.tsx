import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { formatMoney } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import type { BalanceLocation } from '@/features/accounts/api'
import { describeAccountDelete, stopUsingAccountsSummary } from '@/features/accounts/aggregate'

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
 *  Las dos salidas (Eliminar, Mejor archivar) fallan adentro del diálogo, que no se cierra. */
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

  return (
    <Dialog
      open
      onClose={onClose}
      title={`¿Eliminar ${account.name || 'la cuenta'}?`}
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar
          start={
            onArchive &&
            !recommendArchive && (
              <Button variant="ghost" size="sm" onClick={() => run('archive', onArchive)} disabled={busy !== null} loading={busy === 'archive'}>
                Mejor archivar
              </Button>
            )
          }
        >
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy !== null}>
            Cancelar
          </Button>
          <Button
            variant="dangerSolid"
            size="dialogFooter"
            onClick={() => run('delete', onConfirm)}
            disabled={isCountPending || busy === 'archive'}
            loading={busy === 'delete'}
          >
            {busy === 'delete' ? 'Eliminando…' : saveError && busy === null ? 'Reintentar' : description.deleteLabel}
          </Button>
          {recommendArchive && onArchive && (
            <Button variant="primary" size="dialogFooter" onClick={() => run('archive', onArchive)} disabled={busy !== null} loading={busy === 'archive'}>
              Archivar
            </Button>
          )}
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
        <p>{isCountPending ? 'Calculando lo que se borra…' : description.summary}</p>
        {description.balanceChangeText && <p className="font-semibold text-fg">{description.balanceChangeText}</p>}
        <p>
          Los fijos, tarjetas y deudas que pagaste con esta cuenta siguen como pagados. No se puede deshacer.
          {onArchive && recommendArchive && ' Te recomendamos archivarla: deja de sumar al saldo y no toca las otras cuentas.'}
          {onArchive && !recommendArchive && ' Si sólo querés dejar de usarla, archivala: la podés reactivar cuando quieras.'}
        </p>
        {saveError && <DialogSaveError title="No se pudo completar">{saveError}</DialogSaveError>}
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
      title="¿Desactivar Cuentas?"
      size="sm"
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="dangerSolid" size="dialogFooter" onClick={confirm} disabled={isCountsPending} loading={busy}>
            {busy ? 'Desactivando…' : 'Desactivar'}
          </Button>
        </DialogFooterBar>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-[1.55] text-fg-secondary text-pretty">
        <p>
          Guardamos tu saldo de hoy ({isCountsPending ? '…' : formatMoney(balanceCents)}) como un ajuste y conservamos todos tus
          movimientos — la app vuelve a verse como antes de crear cuentas.
        </p>
        <p>{stopUsingAccountsSummary(accountCount)}</p>
        {saveError && <DialogSaveError title="No se pudo completar">{saveError}</DialogSaveError>}
      </div>
    </Dialog>
  )
}
