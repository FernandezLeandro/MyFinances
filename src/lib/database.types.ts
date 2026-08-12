/**
 * Tipos de la base escritos a mano (sin `supabase gen types`, todavía sin CLI logueada).
 * Reflejan `supabase/migrations/`: si el esquema cambia ahí, este archivo se actualiza a mano.
 *
 * `numeric` vuelve como string desde PostgREST — por eso `amount` es `string` en los `Row`,
 * nunca `number`. La conversión a centavos pasa siempre por `src/lib/money.ts`.
 *
 * `Relationships: []` en cada tabla no es opcional: postgrest-js lo exige para que el `Database`
 * satisfaga `GenericSchema`. Sin eso, TypeScript colapsa todo el schema a `never` en silencio y
 * `.rpc()` pierde la inferencia de argumentos.
 */

type Kind = 'income' | 'expense'
type Role = 'user' | 'admin'
type FxSource = 'oficial' | 'blue' | 'bolsa' | 'cripto' | 'manual'
type SavingsEntryKind = 'deposit' | 'withdrawal'
type AssetClass = 'fiat' | 'crypto' | 'equity' | 'bond' | 'other'
type AssetQuoteCurrency = 'ARS' | 'USD'
type AssetPriceSource = 'coingecko' | 'manual'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          currency: string
          role: Role
          created_at: string
          fx_source: FxSource
          usd_rate_manual: string | null
          usd_rate_updated_at: string | null
        }
        Insert: { id: string; display_name?: string | null; currency?: string }
        // `role` no está acá a propósito: la columna se sacó del GRANT de UPDATE para `authenticated`
        // (ver 20260807010001_admin_role.sql), así que el cliente no puede tocarla ni aunque quisiera.
        Update: Partial<{
          display_name: string | null
          currency: string
          fx_source: FxSource
          usd_rate_manual: number | string | null
          usd_rate_updated_at: string | null
        }>
        Relationships: []
      }
      default_categories: {
        Row: {
          id: string
          name: string
          kind: Kind
          color: string
          sort_order: number
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          kind: Kind
          color: string
          sort_order?: number
          is_archived?: boolean
        }
        Update: Partial<{ name: string; kind: Kind; color: string; sort_order: number; is_archived: boolean }>
        Relationships: []
      }
      savings_buckets: {
        Row: {
          id: string
          user_id: string
          name: string
          slug: string | null
          single_currency: boolean
          include_in_total: boolean
          sort_order: number
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          slug?: string | null
          single_currency?: boolean
          include_in_total?: boolean
          sort_order?: number
          is_archived?: boolean
        }
        Update: Partial<{
          name: string
          single_currency: boolean
          include_in_total: boolean
          sort_order: number
          is_archived: boolean
        }>
        Relationships: []
      }
      savings_entries: {
        Row: {
          id: string
          user_id: string
          bucket_id: string
          kind: SavingsEntryKind
          asset_id: string
          amount: string
          rate_to_main: string | null
          occurred_on: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          bucket_id: string
          kind: SavingsEntryKind
          asset_id: string
          amount: number | string
          rate_to_main?: number | string | null
          occurred_on?: string
          note?: string | null
        }
        Update: Partial<{
          kind: SavingsEntryKind
          asset_id: string
          amount: number | string
          rate_to_main: number | string | null
          occurred_on: string
          note: string | null
        }>
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          user_id: string | null
          symbol: string
          name: string
          asset_class: AssetClass
          quote_currency: AssetQuoteCurrency
          decimals: number
          price_source: AssetPriceSource
          coingecko_id: string | null
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          // Por ahora todo lo que se agrega desde el cliente queda global — `user_id` siempre null.
          // Ver 20260806200001_assets_global_for_now.sql.
          user_id: null
          symbol: string
          name: string
          asset_class: AssetClass
          quote_currency: AssetQuoteCurrency
          decimals?: number
          price_source?: AssetPriceSource
        }
        Update: Partial<{
          name: string
          asset_class: AssetClass
          quote_currency: AssetQuoteCurrency
          is_archived: boolean
        }>
        Relationships: []
      }
      asset_manual_prices: {
        Row: { user_id: string; asset_id: string; price: string; updated_at: string }
        Insert: { user_id: string; asset_id: string; price: number | string; updated_at?: string }
        Update: Partial<{ price: number | string; updated_at: string }>
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          kind: Kind
          color: string
          icon: string | null
          is_archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          kind: Kind
          color: string
          icon?: string | null
          is_archived?: boolean
        }
        Update: Partial<{ name: string; kind: Kind; color: string; icon: string | null; is_archived: boolean }>
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: Kind
          amount: string
          occurred_on: string
          category_id: string | null
          description: string | null
          fixed_expense_payment_id: string | null
          is_adjustment: boolean
          is_credit_card_payment: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: Kind
          amount: number | string
          occurred_on: string
          category_id?: string | null
          description?: string | null
          fixed_expense_payment_id?: string | null
          is_adjustment?: boolean
          is_credit_card_payment?: boolean
        }
        Update: Partial<{
          type: Kind
          amount: number | string
          occurred_on: string
          category_id: string | null
          description: string | null
        }>
        Relationships: []
      }
      fixed_expenses: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: string
          category_id: string | null
          due_day: number
          is_active: boolean
          starts_on: string
          ends_on: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount: number | string
          category_id?: string | null
          due_day: number
          is_active?: boolean
          starts_on?: string
          ends_on?: string | null
          notes?: string | null
        }
        Update: Partial<{
          name: string
          amount: number | string
          category_id: string | null
          due_day: number
          is_active: boolean
          starts_on: string
          ends_on: string | null
          notes: string | null
        }>
        Relationships: []
      }
      fixed_expense_payments: {
        Row: {
          id: string
          user_id: string
          fixed_expense_id: string
          period: string
          paid_at: string
          amount_paid: string
          transaction_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          fixed_expense_id: string
          period: string
          amount_paid: number | string
          transaction_id?: string | null
        }
        Update: Partial<{ transaction_id: string | null }>
        Relationships: []
      }
      credit_cards: {
        Row: {
          id: string
          user_id: string
          name: string
          due_day: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          due_day: number
        }
        Update: Partial<{ name: string; due_day: number }>
        Relationships: []
      }
      credit_purchases: {
        Row: {
          id: string
          user_id: string
          card_id: string
          description: string
          installment_amount: string
          installments: number
          first_period: string
          category_id: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          description: string
          installment_amount: number | string
          installments: number
          first_period: string
          category_id?: string | null
          notes?: string | null
        }
        Update: Partial<{
          description: string
          installment_amount: number | string
          installments: number
          first_period: string
          category_id: string | null
          notes: string | null
        }>
        Relationships: []
      }
      credit_card_savings: {
        Row: {
          id: string
          user_id: string
          card_id: string
          period: string
          amount: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          period: string
          amount: number | string
          updated_at?: string
        }
        Update: Partial<{ amount: number | string; updated_at: string }>
        Relationships: []
      }
      credit_card_payments: {
        Row: {
          id: string
          user_id: string
          card_id: string
          period: string
          paid_at: string
          amount_paid: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id: string
          period: string
          amount_paid: number | string
        }
        Update: Record<string, never>
        Relationships: []
      }
      credit_card_payment_items: {
        Row: {
          id: string
          user_id: string
          payment_id: string
          purchase_id: string | null
          description: string
          installment_no: number
          installments: number
          amount: string
          category_id: string | null
          transaction_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          payment_id: string
          purchase_id?: string | null
          description: string
          installment_no: number
          installments: number
          amount: number | string
          category_id?: string | null
          transaction_id?: string | null
        }
        Update: Partial<{ description: string; transaction_id: string | null }>
        Relationships: []
      }
      balance_locations: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: string
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount?: number | string
          updated_at?: string
        }
        Update: Partial<{ name: string; amount: number | string; updated_at: string }>
        Relationships: []
      }
      receivables: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: string
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount?: number | string
          updated_at?: string
        }
        Update: Partial<{ name: string; amount: number | string; updated_at: string }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      v_monthly_summary: {
        Args: { p_period: string }
        Returns: { total_income: string; total_expense: string; balance: string }[]
      }
      v_spend_by_category: {
        Args: { p_from: string; p_to: string }
        Returns: { category_id: string; category_name: string; color: string; total: string }[]
      }
      rpc_projected_balance: {
        Args: { p_period: string }
        Returns: number
      }
      rpc_current_balance: {
        Args: Record<string, never>
        Returns: number
      }
      rpc_monthly_series: {
        Args: { p_from: string; p_to: string }
        Returns: {
          period: string
          total_income: string
          total_expense: string
          net: string
          running_balance: string
        }[]
      }
      rpc_mark_fixed_expense_paid: {
        Args: { p_fixed_expense_id: string; p_period: string; p_amount?: number | string | null }
        Returns: undefined
      }
      rpc_unmark_fixed_expense_paid: {
        Args: { p_fixed_expense_id: string; p_period: string }
        Returns: undefined
      }
      rpc_check_invite_code: {
        Args: { p_code: string }
        Returns: boolean
      }
      rpc_redeem_invite_code: {
        Args: { p_code: string; p_display_name?: string | null }
        Returns: undefined
      }
      rpc_create_invite_code: {
        Args: { p_max_uses?: number; p_expires_at?: string | null }
        Returns: { code: string; max_uses: number; expires_at: string | null }[]
      }
      rpc_admin_list_invite_codes: {
        Args: Record<string, never>
        Returns: {
          code: string
          max_uses: number
          used_count: number
          expires_at: string | null
          is_active: boolean
          created_at: string
        }[]
      }
      rpc_admin_delete_invite_code: {
        Args: { p_code: string }
        Returns: undefined
      }
      rpc_reorder_default_categories: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      v_credit_installments: {
        Args: { p_period: string }
        Returns: {
          card_id: string
          purchase_id: string
          description: string
          installment_no: number
          installments: number
          amount: string
          category_id: string | null
        }[]
      }
      rpc_mark_credit_card_paid: {
        Args: { p_card_id: string; p_period: string }
        Returns: undefined
      }
      rpc_unmark_credit_card_paid: {
        Args: { p_card_id: string; p_period: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
