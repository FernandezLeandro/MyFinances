import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsToInputText, formatMoney, parseAmountToCents } from '@/lib/money'
import { ultimoPeriodo } from '@/features/credits/period'
import { useCategories } from '@/features/categories/api'
import {
  useCreatePurchase,
  useDeletePurchase,
  useUpdatePurchase,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'

const schema = z.object({
  cardId: z.string().min(1, 'Elegí una tarjeta'),
  description: z.string().min(1, 'Falta la descripción').max(140),
  installmentAmount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
    message: 'Ingresá un importe válido',
  }),
  installments: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120, '1 a 120'),
  firstPeriod: z.string().min(1, 'Falta el mes de la primera cuota'),
  categoryId: z.string().min(1, 'Elegí una categoría'),
})

type FormValues = z.infer<typeof schema>

interface PurchaseFormDialogProps {
  open: boolean
  onClose: () => void
  cards: CreditCard[]
  purchase?: CreditPurchase | null
  /** Preseleccionar la tarjeta al cargar desde el detalle de una en particular. */
  defaultCardId?: string
}

/** Alta/edición de una compra en cuotas. La validación de "mes ya pagado" es un chequeo barato del
 *  lado del cliente (una consulta puntual a `credit_card_payments`), no un trigger — evita la cuota
 *  fantasma en un mes que ya se cerró, sin bloquear al usuario con nada más pesado. */
export function PurchaseFormDialog({ open, onClose, cards, purchase, defaultCardId }: PurchaseFormDialogProps) {
  const isEditing = !!purchase
  const { user } = useAuth()
  const { data: categories } = useCategories()
  const createPurchase = useCreatePurchase()
  const updatePurchase = useUpdatePurchase()
  const deletePurchase = useDeletePurchase()
  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense')

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Sin esto, el primer render (antes de que corra el `reset` del efecto de abajo) deja los
    // campos en `undefined` — y el `useMemo` de la preview, que corre en CADA render incluido el
    // primero, le pasa ese `undefined` a `parseAmountToCents` y explota. Mismo criterio que
    // `BucketFormDialog`: todos los campos arrancan con su string vacío, nunca `undefined`.
    defaultValues: { cardId: '', description: '', installmentAmount: '', installments: '1', firstPeriod: '', categoryId: '' },
  })

  const cardId = watch('cardId')
  const installmentAmount = watch('installmentAmount')
  const installments = watch('installments')
  const firstPeriod = watch('firstPeriod')

  useEffect(() => {
    if (!open) return
    reset(
      purchase
        ? {
            cardId: purchase.card_id,
            description: purchase.description,
            installmentAmount: centsToInputText(purchase.installmentAmountCents),
            installments: String(purchase.installments),
            firstPeriod: purchase.first_period.slice(0, 7),
            categoryId: purchase.category_id ?? '',
          }
        : {
            cardId: defaultCardId ?? cards[0]?.id ?? '',
            description: '',
            installmentAmount: '',
            installments: '1',
            firstPeriod: format(new Date(), 'yyyy-MM'),
            categoryId: '',
          },
    )
  }, [open, purchase, defaultCardId, cards, reset])

  const firstPeriodDate = firstPeriod ? `${firstPeriod}-01` : ''

  // Chequeo puntual, no una lista completa: sólo importa si ESE período de ESA tarjeta ya se pagó.
  // Al editar una compra existente no se revalida (su firstPeriod original ya pasó ese filtro antes).
  const { data: alreadyPaid } = useQuery({
    queryKey: ['credit-payment-exists', user?.id, cardId, firstPeriodDate],
    enabled: !!user && !!cardId && !!firstPeriodDate && !isEditing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_card_payments')
        .select('id')
        .eq('card_id', cardId)
        .eq('period', firstPeriodDate)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
  })

  const preview = useMemo(() => {
    const cents = parseAmountToCents(installmentAmount)
    const n = Number(installments)
    if (cents == null || cents <= 0 || !Number.isInteger(n) || n < 1 || !firstPeriodDate) return null
    const last = ultimoPeriodo(firstPeriodDate, n)
    const desde = format(new Date(`${firstPeriodDate}T00:00:00`), 'MMM yyyy', { locale: es })
    const hasta = format(new Date(`${last}T00:00:00`), 'MMM yyyy', { locale: es })
    const total = formatMoney(cents * n)
    return n === 1
      ? `1 cuota de ${formatMoney(cents)} · ${desde} · total ${total}`
      : `${n} cuotas de ${formatMoney(cents)} · de ${desde} a ${hasta} · total ${total}`
  }, [installmentAmount, installments, firstPeriodDate])

  async function onSubmit(values: FormValues) {
    clearErrors('firstPeriod')
    if (!isEditing && alreadyPaid) {
      setError('firstPeriod', { message: 'Ese mes ya está pagado, cargala en el siguiente' })
      return
    }

    const payload = {
      cardId: values.cardId,
      description: values.description.trim(),
      installmentCents: parseAmountToCents(values.installmentAmount)!,
      installments: Number(values.installments),
      firstPeriod: `${values.firstPeriod}-01`,
      categoryId: values.categoryId,
    }

    if (isEditing) {
      await updatePurchase.mutateAsync({ id: purchase.id, ...payload })
    } else {
      await createPurchase.mutateAsync(payload)
    }
    onClose()
  }

  async function onDelete() {
    if (!purchase) return
    await deletePurchase.mutateAsync(purchase.id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar compra' : 'Nueva compra'}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onDelete} disabled={deletePurchase.isPending} className="mr-auto">
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
        {cards.length > 1 && (
          <Field label="Tarjeta" htmlFor="cardId" error={errors.cardId?.message}>
            <Select id="cardId" invalid={!!errors.cardId} {...register('cardId')}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
          <Input id="description" placeholder="Heladera, notebook, super…" invalid={!!errors.description} {...register('description')} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Importe de cada cuota" error={errors.installmentAmount?.message}>
            <AmountInput invalid={!!errors.installmentAmount} {...register('installmentAmount')} />
          </Field>

          <Field label="Cantidad de cuotas" htmlFor="installments" hint="1 a 120" error={errors.installments?.message}>
            <Input id="installments" type="number" min={1} max={120} {...register('installments')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Primera cuota" htmlFor="firstPeriod" error={errors.firstPeriod?.message}>
            <Input id="firstPeriod" type="month" invalid={!!errors.firstPeriod} {...register('firstPeriod')} />
          </Field>

          <Field label="Categoría" htmlFor="categoryId" error={errors.categoryId?.message}>
            <Select id="categoryId" invalid={!!errors.categoryId} {...register('categoryId')}>
              <option value="">Elegir…</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {preview && <p className="text-[12px] text-chalk-faint">{preview}</p>}
      </form>
    </Dialog>
  )
}
