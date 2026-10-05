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
import { DialogFooterBar } from '@/components/ui/dialog-parts'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsToInputText, formatMoney, MAX_AMOUNT_CENTS, parseAmountToCents } from '@/lib/money'
import { parseDueDay, ultimoPeriodo } from '@/features/credits/period'
import { useCategories, useCategoryUsageCounts } from '@/features/categories/api'
import { CategoryPicker } from '@/features/categories/CategoryPicker'
import {
  useCreatePurchase,
  useDeletePurchase,
  useUpdatePurchase,
  type CreditCard,
  type CreditPurchase,
} from '@/features/credits/api'

const schema = z.object({
  /** `''` = sin tarjeta. */
  cardId: z.string(),
  /** Sólo sin tarjeta, y opcional (sin día, la cuota cuenta a fin de mes). */
  dueDay: z.string().refine((v) => parseDueDay(v) !== undefined, '1 a 31, o vacío'),
  description: z.string().trim().min(1, 'Falta la descripción').max(140, 'Máximo 140 caracteres'),
  installmentAmount: z.string().refine(
    (v) => {
      const cents = parseAmountToCents(v)
      return cents !== null && cents > 0 && cents < MAX_AMOUNT_CENTS
    },
    { message: 'Ingresá un importe válido' },
  ),
  installments: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120, '1 a 120'),
  firstPeriod: z.string().min(1, 'Falta el mes de la primera cuota'),
  categoryId: z.string(),
})

type FormValues = z.infer<typeof schema>

interface PurchaseFormDialogProps {
  open: boolean
  onClose: () => void
  cards: CreditCard[]
  purchase?: CreditPurchase | null
  /** Preseleccionar la tarjeta al cargar desde el panel de una en particular. */
  defaultCardId?: string
  /** Se llama al borrar la compra. Por defecto es `onClose` — desde el panel de una compra sin
   *  tarjeta conviene cerrar también el panel, que quedaría mostrando una compra que ya no existe. */
  onDeleted?: () => void
}

/** Alta/edición de una compra en cuotas, con o sin tarjeta. Rediseño de Mis Deudas: importe primero
 *  (mismo arquetipo que el alta de un fijo), y una sola fila de chips decide la tarjeta — «Sin
 *  tarjeta» es una opción más, en vez del par de chips Con/Sin tarjeta + un select aparte. La tarjeta
 *  no se cambia al editar.
 *
 *  La validación de "mes ya pagado" es un chequeo barato del lado del cliente (una consulta puntual a
 *  `credit_card_payments`), no un trigger — evita la cuota fantasma en un mes que ya se cerró; sólo
 *  aplica a compras de tarjeta, una compra suelta nueva no tiene con qué colisionar. */
export function PurchaseFormDialog({ open, onClose, cards, purchase, defaultCardId, onDeleted = onClose }: PurchaseFormDialogProps) {
  const isEditing = !!purchase
  const { user } = useAuth()
  // `true`: incluye archivadas — si la compra ya tenía una categoría que después se archivó, el
  // desplegable sigue mostrándola (ver `expenseCategories` más abajo) en vez de perderla al guardar.
  const { data: categories } = useCategories(true)
  const { data: categoryUsage } = useCategoryUsageCounts()
  const createPurchase = useCreatePurchase()
  const updatePurchase = useUpdatePurchase()
  const deletePurchase = useDeletePurchase()
  const isPending = createPurchase.isPending || updatePurchase.isPending

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Sin esto, el primer render (antes de que corra el `reset` del efecto de abajo) deja los
    // campos en `undefined` — y el `useMemo` de la preview, que corre en CADA render incluido el
    // primero, le pasa ese `undefined` a `parseAmountToCents` y explota.
    defaultValues: {
      cardId: '',
      dueDay: '',
      description: '',
      installmentAmount: '',
      installments: '1',
      firstPeriod: '',
      categoryId: '',
    },
  })

  const cardId = watch('cardId')
  const installmentAmount = watch('installmentAmount')
  const installments = watch('installments')
  const selectedCategoryId = watch('categoryId')
  const firstPeriod = watch('firstPeriod')
  const expenseCategories = (categories ?? []).filter((c) => c.kind === 'expense' && (!c.is_archived || c.id === selectedCategoryId))
  const isStandalone = cardId === ''

  useEffect(() => {
    if (!open) return
    reset(
      purchase
        ? {
            cardId: purchase.card_id ?? '',
            dueDay: purchase.due_day != null ? String(purchase.due_day) : '',
            description: purchase.description,
            installmentAmount: centsToInputText(purchase.installmentAmountCents),
            installments: String(purchase.installments),
            firstPeriod: purchase.first_period.slice(0, 7),
            categoryId: purchase.category_id ?? '',
          }
        : {
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
  const { data: alreadyPaid } = useQuery({
    queryKey: ['credit-payment-exists', user?.id, cardId, firstPeriodDate],
    enabled: !!user && !isStandalone && !!firstPeriodDate && !isEditing,
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

  function onSubmit(values: FormValues) {
    clearErrors('firstPeriod')
    if (!isEditing && alreadyPaid) {
      setError('firstPeriod', { message: 'Ese mes ya está pagado, cargala en el siguiente' })
      return
    }

    const basePayload = {
      description: values.description,
      installmentCents: parseAmountToCents(values.installmentAmount)!,
      installments: Number(values.installments),
      firstPeriod: `${values.firstPeriod}-01`,
      categoryId: values.categoryId || null,
      dueDay: values.cardId === '' ? (parseDueDay(values.dueDay) ?? null) : null,
    }

    if (isEditing) {
      updatePurchase.mutate({ id: purchase.id, ...basePayload }, { onSuccess: onClose })
    } else {
      createPurchase.mutate({ ...basePayload, cardId: values.cardId || null }, { onSuccess: onClose })
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar compra' : 'Nueva compra'}
      footerBleed
      footer={
        <DialogFooterBar
          start={
            isEditing && (
              <Button
                variant="ghost"
                size="dialogFooter"
                onClick={() => deletePurchase.mutate(purchase.id, { onSuccess: onDeleted })}
                disabled={deletePurchase.isPending}
                className="text-negative! hover:text-negative!"
              >
                Eliminar
              </Button>
            )
          }
        >
          <Button variant="outline" size="dialogFooter" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="dialogFooter" onClick={handleSubmit(onSubmit)} disabled={isPending}>
            {isPending ? 'Guardando…' : isEditing ? 'Guardar' : 'Agregar compra'}
          </Button>
        </DialogFooterBar>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <OpeningAmountField
          size="lg"
          align="center"
          allowNegative={false}
          label="Cuota"
          ariaLabel="Importe de cada cuota"
          error={errors.installmentAmount?.message}
          value={installmentAmount}
          onChange={(v) => setValue('installmentAmount', v, { shouldValidate: isSubmitted })}
        />

        {!isEditing && cards.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="eyebrow">¿Con qué la pagás?</span>
            <div className="flex flex-wrap gap-1.5">
              {cards.map((c) => (
                <Chip key={c.id} size="lg" active={cardId === c.id} onClick={() => setValue('cardId', c.id)}>
                  {c.name}
                </Chip>
              ))}
              <Chip size="lg" active={isStandalone} onClick={() => setValue('cardId', '')}>
                Sin tarjeta
              </Chip>
            </div>
          </div>
        )}

        <Field label="Descripción" htmlFor="description" error={errors.description?.message}>
          <Input id="description" placeholder="Heladera, notebook, super…" invalid={!!errors.description} maxLength={140} {...register('description')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuotas" htmlFor="installments" error={errors.installments?.message}>
            <Input id="installments" type="number" inputMode="numeric" min={1} max={120} invalid={!!errors.installments} {...register('installments')} />
          </Field>
          <Field label="Primera cuota" htmlFor="firstPeriod" error={errors.firstPeriod?.message}>
            <Input id="firstPeriod" type="month" invalid={!!errors.firstPeriod} {...register('firstPeriod')} />
          </Field>
        </div>

        {/* Debajo de 420px la categoría y el día no entran lado a lado — se apilan (mismo criterio
            que el alta de un fijo). */}
        <div className="flex flex-col gap-5 min-[420px]:flex-row min-[420px]:items-start min-[420px]:gap-3">
          <div className="min-w-0 flex-1">
            <CategoryPicker
              variant="dropdown"
              categories={expenseCategories}
              usage={categoryUsage}
              value={selectedCategoryId}
              onChange={(id) => setValue('categoryId', id)}
            />
          </div>
          {isStandalone && (
            <Field label="Vence el día" htmlFor="dueDay" hint="Opcional" error={errors.dueDay?.message} className="min-[420px]:w-24 min-[420px]:shrink-0">
              <Input
                id="dueDay"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                invalid={!!errors.dueDay}
                className="h-[50px] text-center font-display font-semibold"
                {...register('dueDay')}
              />
            </Field>
          )}
        </div>

        {preview && <p className="text-[12px] text-fg-muted">{preview}</p>}
      </form>
    </Dialog>
  )
}
