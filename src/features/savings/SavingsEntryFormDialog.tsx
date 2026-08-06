import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { format } from 'date-fns'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input, AmountInput } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { centsFromNumeric, centsToNumeric, parseAmountToCents, parseQuantity, unitsFromNumeric, unitsToNumeric } from '@/lib/money'
import { useAssets, type Asset } from '@/features/assets/api'
import {
  useCreateSavingsEntry,
  useDeleteSavingsEntry,
  useUpdateSavingsEntry,
  type SavingsBucket,
  type SavingsEntry,
} from '@/features/savings/api'

const schema = z.object({
  kind: z.enum(['deposit', 'withdrawal']),
  assetId: z.string().min(1, 'Elegí un activo'),
  // La validación numérica real depende de los decimales del activo elegido (2 para dinero/acciones,
  // 8 para cripto) — no se puede expresar en un schema estático, se resuelve a mano en onSubmit.
  amount: z.string().min(1, 'Ingresá una cantidad'),
  rate: z.string().optional(),
  occurredOn: z.string().min(1, 'Falta la fecha'),
  note: z.string().max(140).optional(),
})

type FormValues = z.infer<typeof schema>

function centsToInputText(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function unitsToInputText(units: number, decimals: number): string {
  return (units / 10 ** decimals).toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

interface SavingsEntryFormDialogProps {
  open: boolean
  onClose: () => void
  bucket: SavingsBucket
  entry?: SavingsEntry | null
}

export function SavingsEntryFormDialog({ open, onClose, bucket, entry }: SavingsEntryFormDialogProps) {
  const isEditing = !!entry
  const { data: allAssets } = useAssets()
  const createEntry = useCreateSavingsEntry()
  const updateEntry = useUpdateSavingsEntry()
  const deleteEntry = useDeleteSavingsEntry()

  // Fondo de emergencia (single_currency) sólo ofrece la moneda principal; el resto, todo el catálogo.
  const assets = useMemo(
    () => (allAssets ?? []).filter((a) => !bucket.single_currency || a.symbol === 'ARS'),
    [allAssets, bucket.single_currency],
  )
  const assetById = useMemo(() => new Map((allAssets ?? []).map((a) => [a.id, a])), [allAssets])
  const arsAssetId = useMemo(() => (allAssets ?? []).find((a) => a.symbol === 'ARS')?.id ?? '', [allAssets])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'deposit', occurredOn: format(new Date(), 'yyyy-MM-dd') },
  })

  const kind = watch('kind')
  const assetId = watch('assetId')
  const amount = watch('amount')
  const selectedAsset: Asset | undefined = assetById.get(assetId)

  // Calculadora de cotización: no se guarda en ningún lado, sólo ayuda a completar "Cotización de
  // compra" a partir de dos números que el usuario sí tiene a mano (cuánto compró y cuánto pagó),
  // en vez de obligarlo a hacer la división él mismo.
  const [totalSpent, setTotalSpent] = useState('')
  const [calcHint, setCalcHint] = useState<string | null>(null)

  function calculateRate() {
    if (!selectedAsset) return
    const units = parseQuantity(amount, selectedAsset.decimals)
    if (units == null || units <= 0) {
      setCalcHint('Ingresá primero la cantidad comprada')
      return
    }
    const totalCents = parseAmountToCents(totalSpent)
    if (totalCents == null || totalCents <= 0) {
      setCalcHint('Ingresá cuánto gastaste en total, en ARS')
      return
    }
    const quantityWhole = units / 10 ** selectedAsset.decimals
    const rateCents = Math.round(totalCents / quantityWhole)
    setValue('rate', (rateCents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 }))
    setCalcHint(null)
  }

  useEffect(() => {
    if (!open) return
    if (entry) {
      const asset = assetById.get(entry.asset_id)
      reset({
        kind: entry.kind,
        assetId: entry.asset_id,
        amount: asset ? unitsToInputText(unitsFromNumeric(entry.amount, asset.decimals), asset.decimals) : entry.amount,
        rate: entry.rate_to_main != null ? centsToInputText(centsFromNumeric(entry.rate_to_main)) : '',
        occurredOn: entry.occurred_on,
        note: entry.note ?? '',
      })
    } else if (arsAssetId) {
      reset({
        kind: 'deposit',
        assetId: arsAssetId,
        amount: '',
        rate: '',
        occurredOn: format(new Date(), 'yyyy-MM-dd'),
        note: '',
      })
    }
  }, [open, entry, arsAssetId, assetById, reset])

  async function onSubmit(values: FormValues) {
    const asset = assetById.get(values.assetId)
    if (!asset) return

    const units = parseQuantity(values.amount, asset.decimals)
    if (units == null || units <= 0) {
      setError('amount', { message: 'Ingresá una cantidad válida' })
      return
    }

    let rateCents: number | null = null
    if (asset.symbol !== 'ARS' && values.kind === 'deposit' && values.rate) {
      const parsed = parseAmountToCents(values.rate)
      if (parsed == null || parsed <= 0) {
        setError('rate', { message: 'Cotización inválida' })
        return
      }
      rateCents = parsed
    }

    const payload = {
      bucketId: bucket.id,
      kind: values.kind,
      assetId: values.assetId,
      amount: unitsToNumeric(units, asset.decimals),
      rateToMain: rateCents == null ? null : centsToNumeric(rateCents),
      occurredOn: values.occurredOn,
      note: values.note?.trim() || null,
    }

    if (isEditing) {
      await updateEntry.mutateAsync({ id: entry.id, ...payload })
    } else {
      await createEntry.mutateAsync(payload)
    }
    onClose()
  }

  async function onDelete() {
    if (!entry) return
    await deleteEntry.mutateAsync(entry.id)
    onClose()
  }

  function selectKind(next: FormValues['kind']) {
    if (next === kind) return
    setValue('kind', next)
    if (next === 'withdrawal') {
      setValue('rate', '')
      setTotalSpent('')
      setCalcHint(null)
    }
  }

  const showRate = !!selectedAsset && selectedAsset.symbol !== 'ARS' && kind === 'deposit'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? `Editar aporte — ${bucket.name}` : `Nuevo aporte — ${bucket.name}`}
      footer={
        <>
          {isEditing && (
            <Button variant="danger" onClick={onDelete} disabled={deleteEntry.isPending} className="mr-auto">
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
        <div className="flex gap-1.5">
          <Chip active={kind === 'deposit'} onClick={() => selectKind('deposit')}>
            Aporte
          </Chip>
          <Chip active={kind === 'withdrawal'} onClick={() => selectKind('withdrawal')}>
            Retiro
          </Chip>
        </div>

        {assets.length > 1 && (
          <Field label="Activo" htmlFor="assetId" error={errors.assetId?.message}>
            <Select
              id="assetId"
              {...register('assetId', {
                onChange: () => {
                  setValue('rate', '')
                  setTotalSpent('')
                  setCalcHint(null)
                },
              })}
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {selectedAsset?.symbol === 'ARS' ? (
          <Field label="Importe" error={errors.amount?.message}>
            <AmountInput invalid={!!errors.amount} {...register('amount')} />
          </Field>
        ) : (
          <Field
            label="Cantidad"
            htmlFor="amount"
            hint={selectedAsset ? `En ${selectedAsset.symbol}` : undefined}
            error={errors.amount?.message}
          >
            <Input id="amount" inputMode="decimal" placeholder="0,00" invalid={!!errors.amount} {...register('amount')} />
          </Field>
        )}

        {showRate && (
          <div className="rounded-control bg-ink-850 p-4">
            <p className="eyebrow">¿No sabés la cotización?</p>
            <p className="mt-1 text-[12px] text-chalk-faint">
              Poné cuánto gastaste en total y la calculamos con la cantidad de arriba.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <Field label="Total gastado en ARS" htmlFor="totalSpent" className="flex-1">
                <Input
                  id="totalSpent"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={totalSpent}
                  onChange={(e) => {
                    setTotalSpent(e.target.value)
                    setCalcHint(null)
                  }}
                />
              </Field>
              <Button type="button" variant="outline" onClick={calculateRate}>
                Calcular
              </Button>
            </div>
            {calcHint && <p className="mt-2 text-[12px] text-coral">{calcHint}</p>}
          </div>
        )}

        {showRate && (
          <Field
            label={`Cotización de compra (ARS por ${selectedAsset!.symbol})`}
            htmlFor="rate"
            hint="Opcional — hace falta para calcular la ganancia más adelante"
            error={errors.rate?.message}
          >
            <Input id="rate" inputMode="decimal" placeholder="0,00" invalid={!!errors.rate} {...register('rate')} />
          </Field>
        )}

        <Field label="Fecha" htmlFor="occurredOn" error={errors.occurredOn?.message}>
          <Input id="occurredOn" type="date" invalid={!!errors.occurredOn} {...register('occurredOn')} />
        </Field>

        <Field label="Nota" htmlFor="note" hint="Opcional">
          <Input id="note" autoComplete="off" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  )
}
