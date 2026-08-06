import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { useCreateBucket, useUpdateBucket, type SavingsBucket } from '@/features/savings/api'

const schema = z.object({
  name: z.string().min(1, 'Falta el nombre').max(60),
  singleCurrency: z.boolean(),
  includeInTotal: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface BucketFormDialogProps {
  open: boolean
  onClose: () => void
  bucket?: SavingsBucket | null
}

export function BucketFormDialog({ open, onClose, bucket }: BucketFormDialogProps) {
  const isEditing = !!bucket
  const createBucket = useCreateBucket()
  const updateBucket = useUpdateBucket()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', singleCurrency: false, includeInTotal: true },
  })

  const singleCurrency = watch('singleCurrency')
  const includeInTotal = watch('includeInTotal')

  useEffect(() => {
    if (!open) return
    reset(
      bucket
        ? { name: bucket.name, singleCurrency: bucket.single_currency, includeInTotal: bucket.include_in_total }
        : { name: '', singleCurrency: false, includeInTotal: true },
    )
  }, [open, bucket, reset])

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name.trim(), singleCurrency: values.singleCurrency, includeInTotal: values.includeInTotal }
    if (isEditing) {
      await updateBucket.mutateAsync({ id: bucket.id, ...payload })
    } else {
      await createBucket.mutateAsync(payload)
    }
    onClose()
  }

  async function onArchive() {
    if (!bucket) return
    await updateBucket.mutateAsync({ id: bucket.id, isArchived: true })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar ítem' : 'Nuevo ítem de Patrimonio'}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onArchive} disabled={updateBucket.isPending} className="mr-auto">
              Archivar
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
          <Input id="name" placeholder="Viaje, auto, plazo fijo…" invalid={!!errors.name} {...register('name')} />
        </Field>

        <Field label="Monedas" hint="Restringir a la moneda principal, o permitir cualquier activo del catálogo">
          <div className="flex gap-1.5">
            <Chip active={singleCurrency} onClick={() => setValue('singleCurrency', true)}>
              Sólo ARS
            </Chip>
            <Chip active={!singleCurrency} onClick={() => setValue('singleCurrency', false)}>
              Cualquier activo
            </Chip>
          </div>
        </Field>

        <Field label="Total de Patrimonio" hint="Si lo sacás, este ítem sigue viéndose como tarjeta, pero no suma en el total ni en la ganancia general">
          <div className="flex gap-1.5">
            <Chip active={includeInTotal} onClick={() => setValue('includeInTotal', true)}>
              Cuenta en el total
            </Chip>
            <Chip active={!includeInTotal} onClick={() => setValue('includeInTotal', false)}>
              No cuenta
            </Chip>
          </div>
        </Field>
      </form>
    </Dialog>
  )
}
