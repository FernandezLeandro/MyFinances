/**
 * Fixtures mínimos para testear `aggregate.ts` sin arrastrar el ruido de una Row completa (8-11
 * campos, la mayoría irrelevantes al cálculo: `user_id`, `created_at`, `slug`, `coingecko_id`...).
 * Cada factory pide sólo lo que un test típico necesita variar; el resto sale de un default
 * razonable. No es un archivo de test — no lo recoge `include: ['src/**\/*.test.ts']` de Vitest.
 */
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'
import type { SavingsBucket, SavingsEntry } from '@/features/savings/api'
import type { CreditCard, CreditCardPayment, CreditCardSaving, CreditInstallment } from '@/features/credits/api'
import type { BalanceLocation, Receivable } from '@/features/reconciliation/api'

const FIXED_DATE = '2026-01-01T00:00:00.000Z'

export function makeAsset(p: Partial<Asset> & Pick<Asset, 'id' | 'symbol'>): Asset {
  return {
    user_id: null,
    name: p.name ?? p.symbol,
    asset_class: 'other',
    quote_currency: 'ARS',
    decimals: 2,
    price_source: 'manual',
    coingecko_id: null,
    is_archived: false,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeBucket(p: Partial<SavingsBucket> & Pick<SavingsBucket, 'id'>): SavingsBucket {
  return {
    user_id: 'user-1',
    name: 'Bucket de test',
    slug: null,
    single_currency: false,
    include_in_total: true,
    sort_order: 0,
    is_archived: false,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeEntry(
  p: Partial<SavingsEntry> & Pick<SavingsEntry, 'asset_id' | 'kind' | 'amount'>,
): SavingsEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    bucket_id: 'bucket-1',
    rate_to_main: null,
    occurred_on: '2026-01-01',
    note: null,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeCard(p: Partial<CreditCard> & Pick<CreditCard, 'id'>): CreditCard {
  return {
    user_id: 'user-1',
    name: 'Tarjeta de test',
    due_day: 10,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeInstallment(
  p: Partial<CreditInstallment> & Pick<CreditInstallment, 'card_id' | 'amountCents'>,
): CreditInstallment {
  return {
    purchase_id: `purchase-${Math.random().toString(36).slice(2)}`,
    description: 'Compra de test',
    installment_no: 1,
    installments: 1,
    category_id: null,
    ...p,
  }
}

export function makeSaving(p: Partial<CreditCardSaving> & Pick<CreditCardSaving, 'card_id' | 'amountCents'>): CreditCardSaving {
  return {
    id: `saving-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    period: '2026-08-01',
    updated_at: FIXED_DATE,
    ...p,
  }
}

export function makePayment(p: Partial<CreditCardPayment> & Pick<CreditCardPayment, 'card_id'>): CreditCardPayment {
  return {
    id: `payment-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    period: '2026-08-01',
    paid_at: FIXED_DATE,
    amountPaidCents: 0,
    ...p,
  }
}

export function makeLocation(p: Partial<BalanceLocation> & Pick<BalanceLocation, 'amountCents'>): BalanceLocation {
  return {
    id: `location-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    name: 'Efectivo',
    updated_at: FIXED_DATE,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeReceivable(p: Partial<Receivable> & Pick<Receivable, 'amountCents'>): Receivable {
  return {
    id: `receivable-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    name: 'Juan',
    updated_at: FIXED_DATE,
    created_at: FIXED_DATE,
    ...p,
  }
}

/** `{ ars: 100, btc: null }` → Map de assetId a `AssetPrice`, con `origin`/`updatedAt` de relleno. */
export function priceMap(precios: Record<string, number | null>): Map<string, AssetPrice> {
  return new Map(
    Object.entries(precios).map(([assetId, priceArsCents]) => [
      assetId,
      { priceArsCents, origin: priceArsCents == null ? 'none' : 'manual', updatedAt: priceArsCents == null ? null : FIXED_DATE },
    ]),
  )
}
