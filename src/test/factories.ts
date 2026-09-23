/**
 * Fixtures mínimos para testear `aggregate.ts` sin arrastrar el ruido de una Row completa (8-11
 * campos, la mayoría irrelevantes al cálculo: `user_id`, `created_at`, `slug`, `coingecko_id`...).
 * Cada factory pide sólo lo que un test típico necesita variar; el resto sale de un default
 * razonable. No es un archivo de test — no lo recoge `include: ['src/**\/*.test.ts']` de Vitest.
 */
import type { Asset } from '@/features/assets/api'
import type { AssetPrice } from '@/features/fx/api'
import type { SavingsBucket, SavingsEntry } from '@/features/savings/api'
import type {
  CreditCard,
  CreditCardPayment,
  CreditCardSaving,
  CreditInstallmentRange,
  CreditPurchase,
  CreditPurchasePayment,
} from '@/features/credits/api'
import type { BalanceLocation } from '@/features/accounts/api'
import type { AccountTransfer } from '@/features/accounts/transfers-api'
import type { Receivable, ReceivablePayment } from '@/features/receivables/api'
import type { FixedExpense, FixedExpensePayment, FixedExpenseSaving } from '@/features/fixed-expenses/api'
import type { Transaction } from '@/features/transactions/api'

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
    goal_cents: null,
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
  p: Partial<CreditInstallmentRange> & Pick<CreditInstallmentRange, 'card_id' | 'amountCents'>,
): CreditInstallmentRange {
  return {
    purchase_id: `purchase-${Math.random().toString(36).slice(2)}`,
    description: 'Compra de test',
    installment_no: 1,
    installments: 1,
    category_id: null,
    // Mismo default que `makePayment`/`makeSaving` ('2026-08-01') — así un test que no pasa `period`
    // ni en el ítem ni en el pago los matchea sin tener que repetirlo en los dos.
    period: '2026-08-01',
    due_on: '2026-08-10',
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

export function makePurchase(p: Partial<CreditPurchase> & Pick<CreditPurchase, 'id'>): CreditPurchase {
  return {
    user_id: 'user-1',
    card_id: null,
    description: 'Compra suelta de test',
    installments: 1,
    first_period: '2026-08-01',
    category_id: null,
    due_day: 10,
    notes: null,
    created_at: FIXED_DATE,
    installmentAmountCents: 0,
    ...p,
  }
}

export function makePurchasePayment(
  p: Partial<CreditPurchasePayment> & Pick<CreditPurchasePayment, 'purchase_id'>,
): CreditPurchasePayment {
  return {
    id: `purchase-payment-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    period: '2026-08-01',
    paid_at: FIXED_DATE,
    amountPaidCents: 0,
    transaction_id: null,
    ...p,
  }
}

export function makeLocation(p: Partial<BalanceLocation> = {}): BalanceLocation {
  return {
    id: `location-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    name: 'Efectivo',
    kind: 'cash',
    openingCents: 0,
    opening_on: FIXED_DATE.slice(0, 10),
    is_default: false,
    is_archived: false,
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
    // Valores del backfill: una deuda de antes de "deudas a favor" es "me deben, no sé cuándo,
    // presté efectivo" — exactamente lo que dejaba `alter table ... add column ... default`.
    expected_period: null,
    already_expensed: false,
    note: null,
    expense_transaction_id: null,
    updated_at: FIXED_DATE,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeReceivablePayment(
  p: Partial<ReceivablePayment> & Pick<ReceivablePayment, 'receivable_id' | 'amountCents'>,
): ReceivablePayment {
  return {
    id: `receivable-payment-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    occurred_on: '2026-01-01',
    transaction_id: null,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeFixedExpense(p: Partial<FixedExpense> & Pick<FixedExpense, 'id'>): FixedExpense {
  return {
    user_id: 'user-1',
    name: 'Fijo de test',
    cents: 10_000_00,
    category_id: null,
    due_day: 10,
    is_active: true,
    is_recurring: false,
    bag_frequency: 'monthly',
    starts_on: '2026-01-01',
    notes: null,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeFixedExpensePayment(
  p: Partial<FixedExpensePayment> & Pick<FixedExpensePayment, 'fixed_expense_id' | 'amountPaidCents'>,
): FixedExpensePayment {
  return {
    id: `fe-payment-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    period: '2026-08-01',
    paid_at: FIXED_DATE,
    transaction_id: null,
    is_recurring: false,
    note: null,
    ...p,
  }
}

export function makeFixedExpenseSaving(
  p: Partial<FixedExpenseSaving> & Pick<FixedExpenseSaving, 'fixed_expense_id' | 'amountCents'>,
): FixedExpenseSaving {
  return {
    id: `fe-saving-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    period: '2026-08-01',
    saved_at: FIXED_DATE,
    note: null,
    // `null` por default: la mayoría de los tests viejos son de un guardado "aparte" (sin
    // movimiento) — pasar `transaction_id` explícito sólo hace falta para probar el caso con
    // movimiento (follow-up de `[[basic-fijos-plan]]`).
    transaction_id: null,
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

export function makeTransaction(p: Partial<Transaction> & Pick<Transaction, 'id' | 'cents' | 'occurred_on'>): Transaction {
  return {
    user_id: 'user-1',
    type: 'expense',
    category_id: null,
    description: null,
    fixed_expense_payment_id: null,
    is_adjustment: false,
    is_credit_card_payment: false,
    account_id: null,
    created_at: FIXED_DATE,
    ...p,
  }
}

export function makeTransfer(
  p: Partial<AccountTransfer> & Pick<AccountTransfer, 'id' | 'cents' | 'occurred_on' | 'from_account_id' | 'to_account_id'>,
): AccountTransfer {
  return {
    user_id: 'user-1',
    description: null,
    created_at: FIXED_DATE,
    ...p,
  }
}
