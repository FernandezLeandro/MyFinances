import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useCreateCreditCard, useDeleteCreditCard, useUpdateCreditCard, type CreditCard } from '@/features/credits/api'

const schema = z.object({
  name: z.string().min(1, 'Falta el nombre').max(80),
  dueDay: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31, '1 a 31'),
})

type FormValues = z.infer<typeof schema>

interface CreditCardFormDialogProps {
  open: boolean
  onClose: () => void
  card?: CreditCard | null
}

/** Alta/edición de tarjeta: sólo nombre y vencimiento. La categoría vive en cada compra, no acá —
 *  ver `PurchaseFormDialog` — porque un pago mensual puede juntar compras de categorías distintas. */
export function CreditCardFormDialog({ open, onClose, card }: CreditCardFormDialogProps) {
  const isEditing = !!card
  const createCard = useCreateCreditCard()
  const updateCard = useUpdateCreditCard()
  const deleteCard = useDeleteCreditCard()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', dueDay: '10' },
  })

  useEffect(() => {
    if (!open) return
    reset(card ? { name: card.name, dueDay: String(card.due_day) } : { name: '', dueDay: '10' })
  }, [open, card, reset])

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name.trim(), dueDay: Number(values.dueDay) }
    if (isEditing) {
      await updateCard.mutateAsync({ id: card.id, ...payload })
    } else {
      await createCard.mutateAsync(payload)
    }
    onClose()
  }

  async function onDelete() {
    if (!card) return
    await deleteCard.mutateAsync(card.id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar tarjeta' : 'Nueva tarjeta'}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onDelete} disabled={deleteCard.isPending} className="mr-auto">
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
          <Input id="name" placeholder="Visa Santander, Mastercard BBVA…" invalid={!!errors.name} {...register('name')} />
        </Field>

        <Field label="Día de vencimiento" htmlFor="dueDay" hint="1 a 31" error={errors.dueDay?.message}>
          <Input id="dueDay" type="number" min={1} max={31} {...register('dueDay')} />
        </Field>
      </form>
    </Dialog>
  )
}
