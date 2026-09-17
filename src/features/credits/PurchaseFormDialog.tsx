import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
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

const schema = z
  .object({
    mode: z.enum(['card', 'standalone']),
    cardId: z.string(),
    dueDay: z.string(),
    description: z.string().min(1, 'Falta la descripción').max(140),
    installmentAmount: z.string().refine((v) => parseAmountToCents(v) !== null && parseAmountToCents(v)! > 0, {
      message: 'Ingresá un importe válido',
    }),
    installments: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120, '1 a 120'),
    firstPeriod: z.string().min(1, 'Falta el mes de la primera cuota'),
    categoryId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'card' && !values.cardId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cardId'], message: 'Elegí una tarjeta' })
    }
    if (values.mode === 'standalone') {
      const n = Number(values.dueDay)
      if (!values.dueDay || !Number.isInteger(n) || n < 1 || n > 31) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDay'], message: 'Ingresá un día entre 1 y 31' })
      }
    }
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

/** Alta/edición de una compra en cuotas, con o sin tarjeta. La validación de "mes ya pagado" es un
 *  chequeo barato del lado del cliente (una consulta puntual a `credit_card_payments`), no un
 *  trigger — evita la cuota fantasma en un mes que ya se cerró, sin bloquear al usuario con nada
 *  más pesado; sólo aplica a compras de tarjeta, una compra suelta nueva no tiene con qué colisionar.
 *
 *  El toggle "Con tarjeta"/"Sin tarjeta" sólo aparece al cargar una compra nueva sin un
 *  `defaultCardId` fijo (i.e. no se abrió desde el detalle de una tarjeta puntual) y habiendo al
 *  menos una tarjeta cargada — si no hay ninguna, se arranca directo en modo suelto sin mostrar el
 *  toggle. El modo no se puede cambiar al editar. */
export function PurchaseFormDialog({ open, onClose, cards, purchase, defaultCardId }: PurchaseFormDialogProps) {
  const isEditing = !!purchase
  const { user } = useAuth()
  // `true`: incluye archivadas — si la compra ya tenía una categoría que después se archivó, el
  // select sigue mostrándola (ver `expenseCategories` más abajo) en vez de perderla al guardar.
  const { data: categories } = useCategories(true)
  const createPurchase = useCreatePurchase()
  const updatePurchase = useUpdatePurchase()
  const deletePurchase = useDeletePurchase()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
    defaultValues: {
      mode: 'card',
      cardId: '',
      dueDay: '',
      description: '',
      installmentAmount: '',
      installments: '1',
      firstPeriod: '',
      categoryId: '',
    },
  })

  const mode = watch('mode')
  const cardId = watch('cardId')
  const installmentAmount = watch('installmentAmount')
  const installments = watch('installments')
  const selectedCategoryId = watch('categoryId')
  const expenseCategories = (categories ?? []).filter(
    (c) => c.kind === 'expense' && (!c.is_archived || c.id === selectedCategoryId),
  )
  const firstPeriod = watch('firstPeriod')

  const canToggleMode = !isEditing && !defaultCardId && cards.length > 0

  useEffect(() => {
    if (!open) return
    reset(
      purchase
        ? {
            mode: purchase.card_id ? 'card' : 'standalone',
            cardId: purchase.card_id ?? '',
            dueDay: purchase.due_day != null ? String(purchase.due_day) : '',
            description: purchase.description,
            installmentAmount: centsToInputText(purchase.installmentAmountCents),
            installments: String(purchase.installments),
            firstPeriod: purchase.first_period.slice(0, 7),
            categoryId: purchase.category_id ?? '',
          }
        : {
            mode: defaultCardId || cards.length > 0 ? 'card' : 'standalone',
            cardId: defaultCardId ?? cards[0]?.id ?? '',
            dueDay: '',
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
  // Sólo aplica en modo tarjeta: una compra suelta nueva no tiene pagos previos con los que chocar.
  const { data: alreadyPaid } = useQuery({
    queryKey: ['credit-payment-exists', user?.id, cardId, firstPeriodDate],
    enabled: !!user && mode === 'card' && !!cardId && !!firstPeriodDate && !isEditing,
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

    const basePayload = {
      description: values.description.trim(),
      installmentCents: parseAmountToCents(values.installmentAmount)!,
      installments: Number(values.installments),
      firstPeriod: `${values.firstPeriod}-01`,
      categoryId: values.categoryId || null,
      dueDay: values.mode === 'standalone' ? Number(values.dueDay) : null,
    }

    if (isEditing) {
      await updatePurchase.mutateAsync({ id: purchase.id, ...basePayload })
    } else {
      await createPurchase.mutateAsync({ ...basePayload, cardId: values.mode === 'card' ? values.cardId : null })
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
            <Button variant="danger" size="dialogFooter" onClick={onDelete} disabled={deletePurchase.isPending} className="sm:mr-auto">
              Eliminar
            </Button>
          )}
          <Button variant="ghost" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        {canToggleMode && (
          <div className="flex gap-1.5">
            <Chip active={mode === 'card'} onClick={() => setValue('mode', 'card')}>
              Con tarjeta
            </Chip>
            <Chip active={mode === 'standalone'} onClick={() => setValue('mode', 'standalone')}>
              Sin tarjeta
            </Chip>
          </div>
        )}

        {mode === 'card' ? (
          cards.length > 1 && (
            <Field label="Tarjeta" htmlFor="cardId" error={errors.cardId?.message}>
              <Select id="cardId" invalid={!!errors.cardId} {...register('cardId')}>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )
        ) : (
          <Field label="Día de vencimiento" htmlFor="dueDay" hint="1 a 31" error={errors.dueDay?.message}>
            <Input id="dueDay" type="number" min={1} max={31} invalid={!!errors.dueDay} {...register('dueDay')} />
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

          <Field label="Categoría" htmlFor="categoryId" hint="Opcional">
            <Select id="categoryId" {...register('categoryId')}>
              <option value="">Sin categoría</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_archived && ' (archivada)'}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {preview && <p className="text-[12px] text-fg-muted">{preview}</p>}
      </form>
    </Dialog>
  )
}
