import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Field, Input } from '@/components/ui/Input'
import { parseDueDay } from '@/features/credits/period'
import { useCreateCreditCard, useDeleteCreditCard, useUpdateCreditCard, type CreditCard } from '@/features/credits/api'

const schema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(80, 'Máximo 80 caracteres'),
  dueDay: z.string().refine((v) => parseDueDay(v) !== undefined, '1 a 31, o vacío'),
})

type FormValues = z.infer<typeof schema>

interface CreditCardFormDialogProps {
  open: boolean
  onClose: () => void
  card?: CreditCard | null
  /** Se llama al borrar la tarjeta. Por defecto es `onClose` — desde el panel de una tarjeta conviene
   *  cerrar también el panel, que quedaría mostrando una tarjeta que ya no existe. */
  onDeleted?: () => void
}

/** Alta/edición de tarjeta: sólo nombre y vencimiento (opcional — sin día, sus cuotas cuentan a fin
 *  de mes). La categoría vive en cada compra, no acá — ver `PurchaseFormDialog` — porque un pago
 *  mensual puede juntar compras de categorías distintas. */
export function CreditCardFormDialog({ open, onClose, card, onDeleted = onClose }: CreditCardFormDialogProps) {
  const isEditing = !!card
  const createCard = useCreateCreditCard()
  const updateCard = useUpdateCreditCard()
  const deleteCard = useDeleteCreditCard()
  const isPending = createCard.isPending || updateCard.isPending

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', dueDay: '' },
  })

  useEffect(() => {
    if (!open) return
    reset(card ? { name: card.name, dueDay: card.due_day != null ? String(card.due_day) : '' } : { name: '', dueDay: '' })
  }, [open, card, reset])

  function onSubmit(values: FormValues) {
    const payload = { name: values.name, dueDay: parseDueDay(values.dueDay) ?? null }
    if (isEditing) {
      updateCard.mutate({ id: card.id, ...payload }, { onSuccess: onClose })
    } else {
      createCard.mutate(payload, { onSuccess: onClose })
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar tarjeta' : 'Nueva tarjeta'}
      footerBleed
      footer={
        <DialogFooterBar
          start={
            isEditing && (
              <Button
                variant="ghost"
                size="dialogFooter"
                onClick={() => deleteCard.mutate(card.id, { onSuccess: onDeleted })}
                disabled={deleteCard.isPending}
                className="text-negative! hover:text-negative!"
              >
                Eliminar tarjeta
              </Button>
            )
          }
        >
          <Button variant="outline" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isPending}>
            {isPending ? 'Guardando…' : isEditing ? 'Guardar' : 'Agregar tarjeta'}
          </Button>
        </DialogFooterBar>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
          <Input id="name" placeholder="Visa Santander, Mastercard BBVA…" invalid={!!errors.name} maxLength={80} {...register('name')} />
        </Field>

        <Field label="Vence el día" htmlFor="dueDay" hint="Opcional · 1 a 31" error={errors.dueDay?.message}>
          <Input id="dueDay" type="number" inputMode="numeric" min={1} max={31} invalid={!!errors.dueDay} {...register('dueDay')} />
        </Field>
      </form>
    </Dialog>
  )
}
