import { useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogSummaryBlock } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import { useCan } from '@/features/access/useCan'
import { useAdjustAccountBalance, type AdjustMode, type BalanceLocation } from '@/features/accounts/api'
import { planAdjustment } from '@/features/accounts/aggregate'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { summarizeReceivables } from '@/features/receivables/aggregate'

interface AdjustBalanceDialogProps {
  open: boolean
  onClose: () => void
  account: BalanceLocation
  /** El saldo de la cuenta según la app hoy. */
  derivedCents: number
}

/**
 * Reajustar el saldo de una cuenta, a pedido: el usuario dice cuánto tiene de verdad y elige qué
 * hacer con la diferencia — registrarla como un movimiento de ajuste, o corregir el saldo inicial de
 * la cuenta. Es la única forma de tocar la apertura: no se edita a mano en ningún otro lado.
 *
 * La diferencia final la calcula la base (`rpc_adjust_account_balance`) contra el saldo del momento;
 * lo que se muestra acá es una vista previa con el saldo que el cliente tiene cargado.
 */
export function AdjustBalanceDialog({ open, onClose, account, derivedCents }: AdjustBalanceDialogProps) {
  const adjust = useAdjustAccountBalance()
  const canMeDeben = useCan('me-deben')
  const { data: receivables } = useReceivables()
  const { data: payments } = useReceivablePayments()

  const [realInput, setRealInput] = useState(() => centsToInputText(derivedCents))
  const [mode, setMode] = useState<AdjustMode>('movement')
  const [error, setError] = useState<string | null>(null)

  const realCents = parseAmountToCents(realInput)
  const plan = realCents === null ? null : planAdjustment({ derivedCents, openingCents: account.openingCents, realCents })

  // Prestar plata no genera un movimiento: lo que te deben sigue "dentro" del saldo de la app aunque
  // el efectivo ya no esté en la mano. Reajustar contra lo que hay en la mano fabricaría un gasto
  // falso — el camino correcto es "descontar" la deuda en Me Deben.
  const lentCents = useMemo(
    () => summarizeReceivables(receivables ?? [], payments ?? [], new Date()).contadoEnSaldoCents,
    [receivables, payments],
  )

  async function handleConfirm() {
    if (realCents === null) {
      setError('Ingresá un importe válido')
      return
    }
    if (plan?.diffCents === 0) {
      setError('Ya coincide con el saldo actual: no hay nada que reajustar')
      return
    }
    setError(null)
    await adjust.mutateAsync({ accountId: account.id, realCents, mode })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reajustar saldo"
      footer={
        <>
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleConfirm} disabled={adjust.isPending}>
            {adjust.isPending ? 'Reajustando…' : 'Reajustar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <DialogSummaryBlock
          title="Según la app"
          hint={account.name || '(sin nombre)'}
          figure={formatMoney(derivedCents)}
        />

        <div className="flex flex-col gap-1.5">
          <OpeningAmountField
            label={`¿Cuánto tenés hoy en ${account.name || 'esta cuenta'}?`}
            hint="El saldo real, lo que ves en tu banco o billetera, o el efectivo que tenés en la mano."
            value={realInput}
            onChange={(value) => {
              setRealInput(value)
              setError(null)
            }}
            ariaLabel="Saldo real de la cuenta"
          />
          {error && <p className="text-[12px] text-negative">{error}</p>}
          {plan && plan.diffCents !== 0 && (
            <p className="text-[12.5px] text-fg-secondary">
              Diferencia:{' '}
              <span className={plan.diffCents > 0 ? 'font-semibold text-accent' : 'font-semibold text-negative'}>
                {formatMoney(plan.diffCents, { signed: true })}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="eyebrow">Qué hacemos con la diferencia</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={mode === 'movement'} onClick={() => setMode('movement')}>
              Registrar un ajuste
            </Chip>
            <Chip active={mode === 'opening'} onClick={() => setMode('opening')}>
              Corregir el saldo inicial
            </Chip>
          </div>
          <p className="text-[12px] leading-snug text-fg-muted">
            {mode === 'movement'
              ? plan?.movement
                ? `Queda en Movimientos como "Ajuste de saldo" (${plan.movement.type === 'income' ? 'ingreso' : 'gasto'} de ${formatMoney(plan.movement.cents)}), afuera de Análisis.`
                : 'Queda en Movimientos como "Ajuste de saldo", afuera de Análisis.'
              : plan
                ? `El saldo inicial pasa de ${formatMoney(account.openingCents)} a ${formatMoney(plan.newOpeningCents)}. No crea ningún movimiento.`
                : 'Corrige el saldo con el que arrancó la cuenta. No crea ningún movimiento.'}
          </p>
        </div>

        {canMeDeben && lentCents > 0 && (
          <p className="rounded-control bg-badge-amber-bg px-3 py-2 text-[12px] leading-snug text-badge-amber-fg">
            Te deben {formatMoney(lentCents)} que todavía cuentan en tu saldo (prestar plata no genera un movimiento). Si
            ya no tenés esa plata en la mano, descontala desde Me Deben en vez de ajustarla acá.
          </p>
        )}
      </div>
    </Dialog>
  )
}
