import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, AmountInput } from '@/components/ui/Input'
import { centsToInputText, parseAmountToCents } from '@/lib/money'
import { useSetCreditCardSaving, type CreditCard } from '@/features/credits/api'

interface SavedAmountDialogProps {
  open: boolean
  onClose: () => void
  card: CreditCard
  period: string
  savedCents: number
}

/** Un monto editable por tarjeta y mes — no un historial de aportes (eso queda fuera de v1). */
export function SavedAmountDialog({ open, onClose, card, period, savedCents }: SavedAmountDialogProps) {
  const [input, setInput] = useState(() => (savedCents > 0 ? centsToInputText(savedCents) : ''))
  const [error, setError] = useState<string | null>(null)
  const setSaving = useSetCreditCardSaving()

  async function handleConfirm() {
    const cents = input.trim() === '' ? 0 : parseAmountToCents(input)
    if (cents == null || cents < 0) {
      setError('Ingresá un importe válido')
      return
    }
    await setSaving.mutateAsync({ cardId: card.id, period, cents })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Plata guardada — ${card.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={setSaving.isPending}>
            {setSaving.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-chalk-faint">
          Cuánto ya apartaste de este mes para pagar esta tarjeta — no hace falta decir dónde está guardado, sólo cuánto.
        </p>
        <Field label="Guardado este mes" error={error ?? undefined}>
          <AmountInput
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setError(null)
            }}
            invalid={!!error}
          />
        </Field>
      </div>
    </Dialog>
  )
}
