import { useState } from 'react'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput } from '@/components/ui/Input'
import { Money } from '@/components/ui/Money'
import { parseAmountToCents } from '@/lib/money'
import { useCreateTransaction, useCurrentBalance, type TransactionType } from '@/features/transactions/api'
import { TransactionFormDialog } from '@/features/transactions/TransactionFormDialog'

interface AdjustBalanceDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Para cuando el saldo de la app no coincide con la plata real. Se escribe el saldo real y se
 * calcula la diferencia contra `useCurrentBalance` — el mismo dato que ya muestra el hero de Hoy,
 * no uno nuevo. Dos salidas: ajustar directo (sin categoría, afuera de Análisis — el camino del
 * cierre de mes) o abrir el alta normal para categorizarlo como un movimiento real.
 */
export function AdjustBalanceDialog({ open, onClose }: AdjustBalanceDialogProps) {
  const { data: currentBalanceCents } = useCurrentBalance()
  const createTx = useCreateTransaction()
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registerPrompt, setRegisterPrompt] = useState<{ type: TransactionType; cents: number } | null>(null)

  const targetCents = parseAmountToCents(input)
  const diffCents = targetCents != null && currentBalanceCents != null ? targetCents - currentBalanceCents : null

  // El <dialog> nativo dispara "close" tanto al cerrarlo el usuario como cuando el propio código lo
  // cierra vía `.close()` (acá pasa al abrir el alta de movimiento encima). Sin este filtro, pasar
  // al segundo paso cerraba todo el flujo de un tirón — el mismo bug que ya apareció con el
  // historial de Patrimonio.
  function handleDialogClose() {
    if (!registerPrompt) onClose()
  }

  function validateDiff(): number | null {
    if (targetCents == null) {
      setError('Ingresá el saldo real que tenés')
      return null
    }
    if (diffCents === 0) {
      setError('Ya está cuadrado — no hace falta ajustar nada')
      return null
    }
    return diffCents
  }

  async function handleAdjustOnly() {
    const diff = validateDiff()
    if (diff == null) return

    await createTx.mutateAsync({
      type: diff > 0 ? 'income' : 'expense',
      cents: Math.abs(diff),
      occurredOn: format(new Date(), 'yyyy-MM-dd'),
      categoryId: null,
      description: 'Ajuste de saldo',
      isAdjustment: true,
    })
    onClose()
  }

  function handleRegisterInstead() {
    const diff = validateDiff()
    if (diff == null) return
    setRegisterPrompt({ type: diff > 0 ? 'income' : 'expense', cents: Math.abs(diff) })
  }

  return (
    <>
      <Dialog
        open={open && !registerPrompt}
        onClose={handleDialogClose}
        title="Ajustar saldo"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleRegisterInstead} disabled={createTx.isPending}>
              Registrar como movimiento
            </Button>
            <Button onClick={handleAdjustOnly} disabled={createTx.isPending}>
              {createTx.isPending ? 'Ajustando…' : 'Sólo ajustar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="eyebrow">Saldo actual según MyFinances</p>
            <Money cents={currentBalanceCents ?? 0} tone="dim" size="figure" className="mt-1" />
          </div>

          <Field label="Saldo real que tenés" error={error ?? undefined}>
            <AmountInput
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
              }}
              invalid={!!error}
            />
          </Field>

          {diffCents != null && diffCents !== 0 && (
            <p className="text-[13px] text-chalk-faint">
              Diferencia:{' '}
              <Money cents={diffCents} tone={diffCents < 0 ? 'coral' : 'acid'} signed />
              {diffCents < 0 ? ' de menos' : ' de más'}
            </p>
          )}

          <p className="text-[12px] text-chalk-faint">
            "Sólo ajustar" crea el movimiento sin categoría, afuera de Análisis — para cuando no sabés
            de dónde salió la diferencia, o cuando cerrás el mes dejando el saldo en $0. Si sabés qué
            fue, "Registrar como movimiento" lo carga como un gasto o ingreso real, con categoría.
          </p>
        </div>
      </Dialog>

      {registerPrompt && (
        <TransactionFormDialog
          open={!!registerPrompt}
          onClose={() => {
            setRegisterPrompt(null)
            onClose()
          }}
          prefill={registerPrompt}
        />
      )}
    </>
  )
}
