import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { formatMoney } from '@/lib/money'
import { useAccountDeleteImpact, type BalanceLocation } from '@/features/accounts/api'
import { archiveBlocker, deleteImpactText } from '@/features/accounts/aggregate'

interface ArchiveAccountDialogProps {
  open: boolean
  onClose: () => void
  account: BalanceLocation
  /** Su saldo hoy — archivar no la saca del total, así que si no está en $0 se avisa. */
  balanceCents: number
  activeCount: number
  onConfirm: () => void
  pending: boolean
}

/** Archivar siempre confirma: la cuenta sale de los selectores pero SU SALDO SIGUE SUMANDO en el
 *  total, y eso no es obvio. La última cuenta activa no se puede archivar (los movimientos nuevos
 *  se quedarían sin cuenta para elegir). */
export function ArchiveAccountDialog({ open, onClose, account, balanceCents, activeCount, onConfirm, pending }: ArchiveAccountDialogProps) {
  const blocker = archiveBlocker(activeCount)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Archivar cuenta"
      footer={
        blocker ? (
          <Button size="dialogFooter" onClick={onClose}>
            Entendido
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="dialogFooter" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="dialogFooter" onClick={onConfirm} disabled={pending}>
              {pending ? 'Archivando…' : 'Archivar'}
            </Button>
          </>
        )
      }
    >
      {blocker ? (
        <p className="text-[14px] text-fg-secondary">
          <span className="text-fg">{account.name}</span> es tu única cuenta activa. Necesitás al menos una para cargar
          movimientos: creá otra antes de archivarla.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 text-[14px] text-fg-secondary">
          <p>
            ¿Archivar <span className="text-fg">{account.name}</span>? Deja de ofrecerse al cargar algo nuevo y la
            podés reactivar desde Archivadas.
          </p>
          <p className="text-[13px]">
            Su saldo <span className="text-fg">sigue sumando</span> a tu total.
            {balanceCents !== 0 &&
              ` Hoy tiene ${formatMoney(balanceCents)}: si querés sacarla del total, antes transferí esa plata a otra cuenta o reajustá su saldo a $0.`}
          </p>
        </div>
      )}
    </Dialog>
  )
}

interface DeleteAccountDialogProps {
  open: boolean
  onClose: () => void
  account: BalanceLocation
  isLastAccount: boolean
  onConfirm: () => void
  pending: boolean
}

/** Eliminar se lleva la cuenta con sus movimientos y transferencias (`rpc_delete_account`), y no se
 *  puede deshacer — por eso siempre confirma y dice cuánto se borra. Lo que se pagó desde esa cuenta
 *  (fijos, tarjetas, deudas) sigue como pagado. */
export function DeleteAccountDialog({ open, onClose, account, isLastAccount, onConfirm, pending }: DeleteAccountDialogProps) {
  const { data: impact, isPending: isImpactPending } = useAccountDeleteImpact(open ? account.id : null)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Eliminar cuenta"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="dialogFooter" onClick={onConfirm} disabled={pending || isImpactPending}>
            {pending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 text-[14px] text-fg-secondary">
        <p>
          ¿Eliminar <span className="text-fg">{account.name}</span>?{' '}
          {impact ? deleteImpactText(impact, isLastAccount) : 'Calculando lo que se borra…'}
        </p>
        <p className="text-[13px]">
          Los fijos, tarjetas y deudas que pagaste con esta cuenta siguen como pagados. No se puede deshacer.
        </p>
      </div>
    </Dialog>
  )
}
