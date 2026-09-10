import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { useMarkCreditPurchasePaid, type CreditPurchase } from '@/features/credits/api'
import { etiquetaCuota } from '@/features/credits/format'
import { AccountSelect } from '@/features/accounts/AccountSelect'
import { useDefaultAccountId } from '@/features/accounts/useDefaultAccountId'

interface MarkPurchasePaidDialogProps {
  open: boolean
  onClose: () => void
  purchase: CreditPurchase
  period: string
  installmentNo: number
  installments: number
  totalCents: number
}

/** Marcar una compra suelta como pagada: a diferencia de `MarkCardPaidDialog`, acá nunca hay más de
 *  una categoría ni más de un movimiento a generar — una compra suelta ya trae la suya. */
export function MarkPurchasePaidDialog({
  open,
  onClose,
  purchase,
  period,
  installmentNo,
  installments,
  totalCents,
}: MarkPurchasePaidDialogProps) {
  const markPaid = useMarkCreditPurchasePaid()
  const [accountId, setAccountId] = useDefaultAccountId()

  async function handleConfirm() {
    await markPaid.mutateAsync({ purchaseId: purchase.id, period, accountId: accountId || null })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Marcar compra como pagada"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleConfirm} disabled={markPaid.isPending}>
            {markPaid.isPending ? 'Guardando…' : 'Marcar pagada'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="eyebrow">
            {purchase.description} {etiquetaCuota(installmentNo, installments)}
          </p>
          <Money cents={totalCents} tone="dim" size="figure" className="mt-1" />
        </div>

        <p className="text-[12px] text-fg-muted">Se va a generar un movimiento con este importe.</p>

        <Field label="Con qué lo pagué" hint="Opcional">
          <AccountSelect value={accountId} onChange={setAccountId} />
        </Field>
      </div>
    </Dialog>
  )
}
