import { useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { cn } from '@/lib/cn'
import { Dialog } from '@/components/ui/Dialog'
import { DialogFooterBar, DialogSaveError, DialogSummaryBlock } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useCan } from '@/features/access/useCan'
import { useAdjustAccountBalance, type AdjustMode, type BalanceLocation } from '@/features/accounts/api'
import { adjustFormState, adjustResultText } from '@/features/accounts/aggregate'
import { useReceivablePayments, useReceivables } from '@/features/receivables/api'
import { summarizeReceivables } from '@/features/receivables/aggregate'

interface AdjustBalanceDialogProps {
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
 *
 * Se monta sólo mientras está abierto, así el importe arranca precargado con el saldo actual cada
 * vez. Validación y falla de guardado adentro del diálogo (patrón 5b); el resultado sale como aviso.
 */
export function AdjustBalanceDialog({ onClose, account, derivedCents }: AdjustBalanceDialogProps) {
  const adjust = useAdjustAccountBalance()
  const canMeDeben = useCan('me-deben')
  const { data: receivables } = useReceivables()
  const { data: payments } = useReceivablePayments()

  const [realInput, setRealInput] = useState(() => centsToInputText(derivedCents))
  const [mode, setMode] = useState<AdjustMode>('movement')
  const [saveError, setSaveError] = useState<string | null>(null)

  const realCents = parseAmountToCents(realInput)
  const form = adjustFormState(realInput, derivedCents, account.openingCents)
  // `form.plan` ya es `null` cuando `form.error` no lo es (M1 del QA: antes este cálculo repetía la
  // validación de `adjustFormState` y se salteaba con un importe sin sentido, así que el error y el
  // efecto — "…ingreso de $100.000.000.499,00" — se mostraban a la vez).
  const plan = form.plan

  // Prestar plata no genera un movimiento: lo que te deben sigue "dentro" del saldo de la app aunque
  // el efectivo ya no esté en la mano. Reajustar contra lo que hay en la mano fabricaría un gasto
  // falso — el camino correcto es "descontar" la deuda en Me Deben.
  const lentCents = useMemo(
    () => summarizeReceivables(receivables ?? [], payments ?? [], new Date()).contadoEnSaldoCents,
    [receivables, payments],
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.canSubmit || realCents === null || !plan || adjust.isPending) return
    setSaveError(null)
    try {
      await adjust.mutateAsync({ accountId: account.id, realCents, mode })
      const { title, detail } = adjustResultText({
        accountName: account.name,
        realCents,
        diffCents: plan.diffCents,
        mode,
      })
      showToast(title, 'ok', { detail })
      onClose()
    } catch (error) {
      setSaveError(mensajeDeError(error))
    }
  }

  const primaryLabel = adjust.isPending ? 'Reajustando…' : saveError ? 'Reintentar' : 'Reajustar'
  const modeGroupId = useId()

  return (
    <Dialog
      open
      onClose={onClose}
      title="Reajustar saldo"
      subtitle={account.name || '(sin nombre)'}
      footerBleed
      ownsPending
      footer={
        <DialogFooterBar>
          <Button variant="ghost" size="dialogFooter" onClick={onClose} disabled={adjust.isPending}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="adjust-form"
            size="dialogFooter"
            disabled={!form.canSubmit}
            loading={adjust.isPending}
          >
            {primaryLabel}
          </Button>
        </DialogFooterBar>
      }
    >
      <form id="adjust-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <DialogSummaryBlock
          title="Saldo según la app"
          hint="Movimientos y transferencias hasta hoy"
          figure={formatMoney(derivedCents)}
        />

        <div className="flex flex-col gap-2">
          <OpeningAmountField
            size="lg"
            label="¿Cuánto tenés de verdad?"
            error={form.error ?? undefined}
            value={realInput}
            onChange={(value) => {
              setRealInput(value)
              setSaveError(null)
            }}
            ariaLabel="Saldo real de la cuenta"
          />
          {plan && plan.diffCents !== 0 && !form.error && (
            <span
              className={cn(
                'self-start rounded-pill px-2.5 py-1 text-[12.5px] font-semibold',
                plan.diffCents > 0 ? 'bg-accent-soft text-accent-text' : 'bg-badge-red-bg text-badge-red-fg',
              )}
            >
              {formatMoney(plan.diffCents, { signed: true })} de diferencia
            </span>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[14px] font-semibold text-fg">Qué hacemos con la diferencia</legend>
          <div className="flex flex-col overflow-hidden rounded-control border border-border">
            <label
              className={cn(
                'flex gap-3 border-b border-border p-3.5',
                mode === 'movement' && 'bg-editing',
              )}
            >
              <input
                type="radio"
                name={modeGroupId}
                checked={mode === 'movement'}
                onChange={() => setMode('movement')}
                className="mt-0.5 size-[18px] shrink-0 accent-accent"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-fg">Registrar un ajuste</span>
                <span className="text-[12.5px] leading-snug text-fg-secondary">
                  {plan?.movement
                    ? `Queda en Movimientos como "Ajuste de saldo" (${plan.movement.type === 'income' ? 'ingreso' : 'gasto'} de ${formatMoney(plan.movement.cents)}), afuera de Análisis.`
                    : 'Queda en Movimientos como "Ajuste de saldo", afuera de Análisis.'}
                </span>
              </span>
            </label>
            <label className={cn('flex gap-3 p-3.5', mode === 'opening' && 'bg-editing')}>
              <input
                type="radio"
                name={modeGroupId}
                checked={mode === 'opening'}
                onChange={() => setMode('opening')}
                className="mt-0.5 size-[18px] shrink-0 accent-accent"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-fg">Corregir el saldo inicial</span>
                <span className="text-[12.5px] leading-snug text-fg-secondary">
                  {plan
                    ? `El saldo inicial pasa de ${formatMoney(account.openingCents)} a ${formatMoney(plan.newOpeningCents)}. No crea ningún movimiento.`
                    : 'Corrige el saldo con el que arrancó la cuenta. No crea ningún movimiento.'}
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {canMeDeben && lentCents > 0 && (
          <p className="rounded-float bg-badge-amber-bg px-3.5 py-2.5 text-[12px] leading-snug text-badge-amber-fg text-pretty">
            Te deben {formatMoney(lentCents)} que todavía cuentan en tu saldo (prestar plata no genera un movimiento). Si
            ya no tenés esa plata en la mano, descontala desde Me Deben en vez de ajustarla acá.
          </p>
        )}

        {saveError && (
          <DialogSaveError title="No se pudo guardar el reajuste">
            {saveError} Tus datos siguen acá.
          </DialogSaveError>
        )}
      </form>
    </Dialog>
  )
}
