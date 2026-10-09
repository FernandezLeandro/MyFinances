import { useMemo, useState } from 'react'
import { z } from 'zod'
import { format } from 'date-fns'
import { TrendingUp } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { DialogActions, DialogConfirmStack, DialogItemCard } from '@/components/ui/dialog-parts'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, Input } from '@/components/ui/Input'
import { OpeningAmountField } from '@/components/ui/OpeningAmountField'
import { Select } from '@/components/ui/Select'
import {
  MAX_AMOUNT_CENTS,
  centsToNumeric,
  formatMoney,
  parseAmountToCents,
  parseQuantity,
  unitsFromNumeric,
  unitsToNumeric,
} from '@/lib/money'
import { useAssets, type Asset } from '@/features/assets/api'
import { useAssetPrices, useDollarQuotes } from '@/features/fx/api'
import { DOLLAR_TYPES, type DollarType } from '@/features/fx/quotes'
import { useCategories, useCategoryUsageCounts } from '@/features/categories/api'
import { CategoryPicker } from '@/features/categories/CategoryPicker'
import { DateShortcuts } from '@/features/transactions/DateShortcuts'
import { effectiveRateCents, estimateQuantity } from './aggregate'
import { useCreateInvestment, useDeleteInvestment, useUpdateInvestment, type Investment } from './api'

const MIN_OCCURRED_ON = '2000-01-01'
const todayISO = () => format(new Date(), 'yyyy-MM-dd')

const schema = z.object({
  amountCents: z
    .number({ message: 'Ingresá cuánto pagaste (ej. 150.000,00)' })
    .int()
    .positive('Ingresá cuánto pagaste (ej. 150.000,00)')
    .max(MAX_AMOUNT_CENTS, 'Ese importe es demasiado grande'),
  assetId: z.string().min(1, 'Elegí un activo'),
  quantityUnits: z.number({ message: 'Ingresá la cantidad que recibiste' }).int().positive('Ingresá la cantidad que recibiste'),
  rateCents: z.number().int().positive('Ingresá la cotización').max(MAX_AMOUNT_CENTS, 'Esa cotización es demasiado grande').nullable(),
  occurredOn: z
    .string()
    .min(1, 'Falta la fecha')
    .refine((v) => v >= MIN_OCCURRED_ON, 'La fecha no puede ser anterior al 2000')
    .refine((v) => v <= todayISO(), 'No podés cargar una fecha futura'),
  description: z.string().max(140, 'Máximo 140 caracteres'),
})

type Kind = 'investment' | 'market'
type Currency = 'ARS' | 'USD'

function centsToText(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function unitsToText(units: number, decimals: number): string {
  return (units / 10 ** decimals).toLocaleString('es-AR', {
    minimumFractionDigits: decimals === 2 ? 2 : 0,
    maximumFractionDigits: decimals,
  })
}

interface InvestmentFormDialogProps {
  open: boolean
  onClose: () => void
  /** Sin inversión es un alta. Montar con `key` por inversión: el borrador sale de acá una sola vez. */
  investment?: Investment | null
}

/**
 * Alta y edición de una inversión. Lo pagado va en pesos y la cotización es lo que costó cada unidad,
 * también en pesos (por dólar, por USDT, por BTC…): se autocompleta con el valor de hoy (la VENTA, lo
 * que pagarías) pero se puede pisar, porque una inversión vieja no se compró al valor de hoy. La cantidad
 * recibida se sugiere (monto ÷ cotización), pero vale la que escribe el usuario (la del exchange o
 * broker, con comisiones): es la tenencia real. Cotización y cantidad van atadas — si se edita la
 * cantidad, la cotización se recalcula. El tipo de dólar sólo se elige en USD: es con el que se valúa;
 * un activo de mercado se valúa con el dólar que fijó el admin.
 */
export function InvestmentFormDialog({ open, onClose, investment }: InvestmentFormDialogProps) {
  const isEditing = !!investment
  const { data: allAssets } = useAssets(true)
  const { data: categories } = useCategories(true)
  const { data: categoryUsage } = useCategoryUsageCounts()
  const { quotes } = useDollarQuotes()
  const prices = useAssetPrices()
  const createInvestment = useCreateInvestment()
  const updateInvestment = useUpdateInvestment()
  const deleteInvestment = useDeleteInvestment()

  const assets = useMemo(() => allAssets ?? [], [allAssets])
  const arsAsset = assets.find((a) => a.symbol === 'ARS')
  const usdAsset = assets.find((a) => a.symbol === 'USD')
  const marketAssets = assets.filter((a) => a.asset_class !== 'fiat' && (!a.is_archived || a.id === investment?.asset_id))
  const editedAsset = investment ? assets.find((a) => a.id === investment.asset_id) : undefined

  const [kind, setKind] = useState<Kind>(editedAsset && editedAsset.asset_class !== 'fiat' ? 'market' : 'investment')
  const [currency, setCurrency] = useState<Currency>(editedAsset?.symbol === 'USD' ? 'USD' : 'ARS')
  const [marketAssetId, setMarketAssetId] = useState(editedAsset && editedAsset.asset_class !== 'fiat' ? editedAsset.id : '')
  const [amount, setAmount] = useState(investment ? centsToText(Math.round(Number(investment.amount) * 100)) : '')
  const [fxSource, setFxSource] = useState<DollarType | null>(investment?.fx_source ?? null)
  // `null` = sin tocar: se usa el valor de hoy (o la efectiva, si la cantidad manda).
  const [rateText, setRateText] = useState<string | null>(investment?.buy_price ? centsToText(Math.round(Number(investment.buy_price) * 100)) : null)
  const [quantityText, setQuantityText] = useState<string | null>(
    investment && editedAsset ? unitsToText(unitsFromNumeric(investment.quantity, editedAsset.decimals), editedAsset.decimals) : null,
  )
  // La cotización sólo se deriva de la cantidad si el usuario la TOCÓ en esta sesión: al abrir una
  // inversión guardada se muestra la cotización guardada, no la efectiva recalculada.
  const [quantityDirty, setQuantityDirty] = useState(false)
  const [categoryId, setCategoryId] = useState(investment?.category_id ?? '')
  const [description, setDescription] = useState(investment?.description ?? '')
  const [occurredOn, setOccurredOn] = useState(investment?.occurred_on ?? todayISO())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const asset: Asset | undefined =
    kind === 'market' ? assets.find((a) => a.id === marketAssetId) : currency === 'USD' ? usdAsset : arsAsset
  const isArs = asset?.symbol === 'ARS'
  const decimals = asset?.decimals ?? 2

  // Tipo de dólar (sólo USD): el elegido; si no hay, el blue.
  const dollar = fxSource ?? 'blue'

  const amountCents = parseAmountToCents(amount)
  const isUsd = asset?.symbol === 'USD'

  // Valor de hoy por unidad, en centavos de pesos: lo que se autocompleta en «Cotización». USD: la venta
  // del dólar elegido. Mercado: precio en USD del activo × venta del dólar del activo (vacío si falta).
  const marketPriceUsd = kind === 'market' && asset ? (prices.get(asset.id)?.priceUsd ?? null) : null
  const marketSellCents = kind === 'market' && asset ? (quotes.get(asset.fx_source)?.sellCents ?? null) : null
  const suggestedRateCents = isUsd
    ? (quotes.get(dollar)?.sellCents ?? null)
    : marketPriceUsd != null && marketSellCents != null
      ? Math.round(marketPriceUsd * marketSellCents)
      : null

  // Si la cantidad manda, la cotización es la efectiva (pesos ÷ unidades recibidas).
  const quantityUnitsTyped = quantityText != null && asset ? parseQuantity(quantityText, decimals) : null
  const rateFromQuantity =
    !isArs && quantityDirty && quantityText != null && amountCents != null && quantityUnitsTyped != null
      ? effectiveRateCents(amountCents, quantityUnitsTyped, decimals)
      : null
  const rateCents = rateFromQuantity ?? (rateText != null ? parseAmountToCents(rateText) : suggestedRateCents)
  const rateDisplay = rateFromQuantity != null ? centsToText(rateFromQuantity) : (rateText ?? (suggestedRateCents != null ? centsToText(suggestedRateCents) : ''))

  const estimatedUnits = asset && !isArs && amountCents != null && rateCents != null ? estimateQuantity(amountCents, rateCents, decimals) : null
  const quantityUnits = isArs ? amountCents : quantityText != null ? quantityUnitsTyped : estimatedUnits
  const quantityDisplay = quantityText ?? (estimatedUnits != null ? unitsToText(estimatedUnits, decimals) : '')

  const activeCategories = (categories ?? []).filter((c) => c.kind === 'investment' && (!c.is_archived || c.id === categoryId))

  function pickKind(next: Kind) {
    if (next === kind) return
    setKind(next)
    setFxSource(null)
    setRateText(null)
    setQuantityText(null)
    setQuantityDirty(false)
    setErrors({})
  }

  function pickCurrency(next: Currency) {
    if (next === currency) return
    setCurrency(next)
    setFxSource(null)
    setRateText(null)
    setQuantityText(null)
    setQuantityDirty(false)
  }

  function pickDollar(next: DollarType) {
    setFxSource(next)
    setRateText(null)
    setQuantityText(null)
    setQuantityDirty(false)
  }

  function pickMarketAsset(id: string) {
    setMarketAssetId(id)
    setRateText(null)
    setQuantityText(null)
    setQuantityDirty(false)
  }

  function save() {
    const parsed = schema.safeParse({
      amountCents,
      assetId: asset?.id ?? '',
      quantityUnits,
      rateCents: isArs ? null : rateCents,
      occurredOn,
      description: description.trim(),
    })
    const next: Record<string, string> = {}
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message
    } else if (!isArs && parsed.data.rateCents == null) {
      next.rateCents = 'Ingresá la cotización'
    }
    setErrors(next)
    if (!parsed.success || !asset || Object.keys(next).length > 0) return

    const v = parsed.data
    const payload = {
      categoryId: categoryId || null,
      assetId: v.assetId,
      amount: centsToNumeric(v.amountCents),
      quantity: unitsToNumeric(v.quantityUnits, asset.decimals),
      fxSource: isUsd ? dollar : null,
      buyPrice: isArs || v.rateCents == null ? null : centsToNumeric(v.rateCents),
      occurredOn: v.occurredOn,
      description: v.description || null,
    }
    const close = { onSuccess: onClose }
    if (investment) updateInvestment.mutate({ id: investment.id, ...payload }, close)
    else createInvestment.mutate(payload, close)
  }

  const saving = createInvestment.isPending || updateInvestment.isPending
  const quantityLabel = isUsd ? 'Dólares recibidos' : `Cantidad recibida${asset ? ` de ${asset.symbol}` : ''}`
  const rateLabel = `Cotización (pesos por ${isUsd ? 'dólar' : (asset?.symbol ?? 'unidad')})`

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={isEditing ? 'Editar inversión' : 'Nueva inversión'}
        icon={<TrendingUp className="size-5" strokeWidth={2} aria-hidden />}
        tone="accent"
        footer={
          <>
            {isEditing && (
              <Button variant="danger" size="dialogFooter" onClick={() => setConfirmingDelete(true)} disabled={deleteInvestment.isPending} className="sm:mr-auto">
                Eliminar
              </Button>
            )}
            <DialogActions onCancel={onClose}>
              <Button size="dialogFooter" onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : amountCents ? `Guardar inversión · ${formatMoney(amountCents)}` : 'Guardar inversión'}
              </Button>
            </DialogActions>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div>
            <OpeningAmountField
              size="lg"
              align="center"
              allowNegative={false}
              label="¿Cuánto pagaste?"
              hint="En pesos"
              value={amount}
              onChange={(v) => {
                setAmount(v)
                if (!quantityDirty) setQuantityText(null)
              }}
              error={errors.amountCents}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip size="lg" activeTone="ink" active={kind === 'investment'} onClick={() => pickKind('investment')}>
              Inversión
            </Chip>
            <Chip size="lg" activeTone="ink" active={kind === 'market'} onClick={() => pickKind('market')}>
              Activo de mercado
            </Chip>
          </div>

          {kind === 'investment' ? (
            <div className="flex gap-2">
              <Chip active={currency === 'ARS'} onClick={() => pickCurrency('ARS')}>
                ARS
              </Chip>
              <Chip active={currency === 'USD'} onClick={() => pickCurrency('USD')}>
                USD
              </Chip>
            </div>
          ) : (
            <Field label="Activo" htmlFor="inv-asset" error={errors.assetId}>
              <Select id="inv-asset" value={marketAssetId} onChange={(e) => pickMarketAsset(e.target.value)}>
                <option value="">Elegí un activo</option>
                {marketAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} — {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {asset && !isArs && (
            <>
              {isUsd && (
                <Field label="Tipo de dólar">
                  <div className="flex flex-wrap gap-1.5">
                    {DOLLAR_TYPES.map((d) => (
                      <Chip key={d.value} active={dollar === d.value} onClick={() => pickDollar(d.value)}>
                        {d.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              )}

              <Field
                label={rateLabel}
                htmlFor="inv-rate"
                hint="Se completa con el valor de hoy. Cambiala si compraste a otro valor"
                error={errors.rateCents}
              >
                <Input
                  id="inv-rate"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={rateDisplay}
                  invalid={!!errors.rateCents}
                  onChange={(e) => {
                    setRateText(e.target.value)
                    // La cotización manda sobre la cantidad sugerida.
                    setQuantityText(null)
                    setQuantityDirty(false)
                  }}
                />
              </Field>

              <Field
                label={quantityLabel}
                htmlFor="inv-quantity"
                hint="Se calcula sola. Corregila si el exchange o el broker te dio otra"
                error={errors.quantityUnits}
              >
                <Input
                  id="inv-quantity"
                  inputMode="decimal"
                  placeholder="0"
                  value={quantityDisplay}
                  invalid={!!errors.quantityUnits}
                  onChange={(e) => {
                    setQuantityText(e.target.value)
                    setQuantityDirty(true)
                  }}
                />
              </Field>
            </>
          )}

          <CategoryPicker
            categories={activeCategories}
            usage={categoryUsage}
            value={categoryId}
            onChange={setCategoryId}
            variant="dropdown"
            label="Categoría · opcional"
          />

          <div className="flex flex-col gap-2">
            <span className="eyebrow">Fecha</span>
            <DateShortcuts value={occurredOn} onChange={setOccurredOn} today={todayISO()} min={MIN_OCCURRED_ON} max={todayISO()} />
            {errors.occurredOn && <p className="text-[12px] text-negative">{errors.occurredOn}</p>}
          </div>

          <Field label="Descripción" htmlFor="inv-description" hint="Opcional" error={errors.description}>
            <Input
              id="inv-description"
              autoComplete="off"
              maxLength={140}
              value={description}
              invalid={!!errors.description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>

      {confirmingDelete && investment && (
        <Dialog
          open
          onClose={() => setConfirmingDelete(false)}
          size="sm"
          ownsPending
          title="Eliminar inversión"
          tone="danger"
          footer={
            <DialogConfirmStack
              confirmLabel="Eliminar inversión"
              pendingLabel="Eliminando…"
              pending={deleteInvestment.isPending}
              onConfirm={() => deleteInvestment.mutate(investment.id, { onSuccess: onClose })}
              onCancel={() => setConfirmingDelete(false)}
            />
          }
        >
          <div className="flex flex-col gap-4">
            <DialogItemCard
              title={investment.description || editedAsset?.symbol || 'Inversión'}
              meta={`${formatMoney(Math.round(Number(investment.amount) * 100))} · ${investment.occurred_on}`}
            />
            <p className="text-[14px] text-fg-secondary">Sale de tu historial y de tus posiciones. No se puede deshacer.</p>
          </div>
        </Dialog>
      )}
    </>
  )
}
