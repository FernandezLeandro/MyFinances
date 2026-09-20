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
type AccountKind = 'cash' | 'wallet' | 'bank'
type Role = 'user' | 'admin'
type Plan = 'test' | 'basic' | 'premium'
type FxSource = 'oficial' | 'blue' | 'bolsa' | 'cripto' | 'manual'
type CycleKind = 'monthly' | 'biweekly' | 'weekly'
type BagFrequency = 'monthly' | 'biweekly' | 'weekly'
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
          plan: Plan
          created_at: string
          fx_source: FxSource
          usd_rate_manual: string | null
          usd_rate_updated_at: string | null
          cycle_kind: CycleKind
          cycle_week_starts_on: number
        }
        Insert: { id: string; display_name?: string | null; currency?: string }
        // `role` y `plan` no están acá a propósito: las dos columnas se sacaron del GRANT de UPDATE
        // para `authenticated` (ver 20260807010001_admin_role.sql y 20260911010001_user_plans.sql),
        // así que el cliente no puede tocarlas ni aunque quisiera. `cycle_kind`/`cycle_week_starts_on`
        // sí están en el grant (20260911020001_profile_cycle_kind.sql): a diferencia de esas dos, es
        // el propio usuario quien elige su ciclo.
        Update: Partial<{
          display_name: string | null
          currency: string
          fx_source: FxSource
          usd_rate_manual: number | string | null
          usd_rate_updated_at: string | null
          cycle_kind: CycleKind
          cycle_week_starts_on: number
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
          goal_cents: number | null
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
          goal_cents?: number | null
        }
        Update: Partial<{
          name: string
          single_currency: boolean
          include_in_total: boolean
          sort_order: number
          is_archived: boolean
          goal_cents: number | null
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
          account_id: string | null
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
          account_id?: string | null
        }
        Update: Partial<{
          type: Kind
          amount: number | string
          occurred_on: string
          category_id: string | null
          description: string | null
          account_id: string | null
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
          due_day: number | null
          is_active: boolean
          is_recurring: boolean
          /** Sólo relevante cuando `is_recurring`: frecuencia de reseteo propia de la bolsa,
           *  independiente de `profiles.cycle_kind`. Ver migración `20260911040001`. */
          bag_frequency: BagFrequency
          starts_on: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount: number | string
          category_id?: string | null
          due_day?: number | null
          is_active?: boolean
          is_recurring?: boolean
          bag_frequency?: BagFrequency
          starts_on?: string
          notes?: string | null
        }
        Update: Partial<{
          name: string
          amount: number | string
          category_id: string | null
          due_day: number | null
          is_active: boolean
          is_recurring: boolean
          bag_frequency: BagFrequency
          starts_on: string
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
          is_recurring: boolean
          note: string | null
        }
        Insert: {
          id?: string
          user_id: string
          fixed_expense_id: string
          period: string
          amount_paid: number | string
          transaction_id?: string | null
          is_recurring?: boolean
          note?: string | null
        }
        Update: Partial<{ transaction_id: string | null; note: string | null }>
        Relationships: []
      }
      fixed_expense_savings: {
        Row: {
          id: string
          user_id: string
          fixed_expense_id: string
          period: string
          amount: string
          saved_at: string
          note: string | null
          transaction_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          fixed_expense_id: string
          period: string
          amount: number | string
          note?: string | null
          transaction_id?: string | null
        }
        Update: Partial<{ note: string | null; transaction_id: string | null }>
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
          card_id: string | null
          description: string
          installment_amount: string
          installments: number
          first_period: string
          category_id: string | null
          due_day: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          card_id?: string | null
          description: string
          installment_amount: number | string
          installments: number
          first_period: string
          category_id?: string | null
          due_day?: number | null
          notes?: string | null
        }
        Update: Partial<{
          description: string
          installment_amount: number | string
          installments: number
          first_period: string
          category_id: string | null
          due_day: number | null
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
      credit_purchase_payments: {
        Row: {
          id: string
          user_id: string
          purchase_id: string
          period: string
          paid_at: string
          amount_paid: string
          transaction_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          purchase_id: string
          period: string
          amount_paid: number | string
          transaction_id?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      balance_locations: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: string
          kind: AccountKind
          opening_amount: string
          opening_on: string
          is_default: boolean
          is_archived: boolean
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount?: number | string
          kind?: AccountKind
          opening_amount?: number | string
          opening_on?: string
          is_default?: boolean
          is_archived?: boolean
          updated_at?: string
        }
        Update: Partial<{
          name: string
          amount: number | string
          kind: AccountKind
          opening_amount: number | string
          opening_on: string
          is_default: boolean
          is_archived: boolean
          updated_at: string
        }>
        Relationships: []
      }
      account_transfers: {
        Row: {
          id: string
          user_id: string
          from_account_id: string
          to_account_id: string
          amount: string
          occurred_on: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          from_account_id: string
          to_account_id: string
          amount: number | string
          occurred_on: string
          description?: string | null
        }
        Update: Partial<{
          from_account_id: string
          to_account_id: string
          amount: number | string
          occurred_on: string
          description: string | null
        }>
        Relationships: []
      }
      receivables: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: string
          expected_period: string | null
          already_expensed: boolean
          note: string | null
          expense_transaction_id: string | null
          updated_at: string
          created_at: string
        }
        // Insert queda sin uso real: el alta pasa por rpc_create_receivable (puede tener que crear
        // el gasto asociado atómicamente). Se declara igual para que el tipo de la tabla sea
        // completo y `.from('receivables').select()` tipe bien.
        Insert: {
          id?: string
          user_id: string
          name: string
          amount?: number | string
          expected_period?: string | null
          already_expensed?: boolean
          note?: string | null
          expense_transaction_id?: string | null
          updated_at?: string
        }
        Update: Partial<{
          name: string
          amount: number | string
          expected_period: string | null
          already_expensed: boolean
          note: string | null
          expense_transaction_id: string | null
          updated_at: string
        }>
        Relationships: []
      }
      receivable_payments: {
        Row: {
          id: string
          user_id: string
          receivable_id: string
          amount: string
          occurred_on: string
          transaction_id: string | null
          created_at: string
        }
        // Insert/Update quedan sin uso real: los abonos siempre entran y salen por RPC (ver
        // rpc_register_receivable_payment / rpc_delete_receivable_payment). Se declaran igual para
        // que el tipo de la tabla sea completo y `.from('receivable_payments').select()` tipe bien.
        Insert: {
          id?: string
          user_id: string
          receivable_id: string
          amount: number | string
          occurred_on?: string
          transaction_id?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      v_monthly_summary: {
        Args: { p_period: string }
        Returns: { total_income: string; total_expense: string; balance: string }[]
      }
      // Ver `supabase/migrations/20260911030001_cycle_range_functions.sql` — bloque 3 del plan de
      // ciclos configurables. Aditivas: `v_monthly_summary`/`rpc_projected_balance`/
      // `v_credit_installments` de arriba y de más abajo siguen intactas.
      v_range_summary: {
        Args: { p_from: string; p_to: string }
        Returns: { total_income: string; total_expense: string; balance: string }[]
      }
      rpc_projected_balance_range: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      v_spend_by_category: {
        Args: { p_from: string; p_to: string }
        // `category_id`/`color` nulos: la fila "Sin categoría" (Bloque 2) no tiene ninguno de los
        // dos — ver `UNCATEGORIZED_ID` en `src/features/categories/api.ts`.
        Returns: { category_id: string | null; category_name: string; color: string | null; total: string }[]
      }
      rpc_current_balance: {
        Args: Record<string, never>
        Returns: number
      }
      rpc_account_balances: {
        Args: Record<string, never>
        Returns: { account_id: string; derived: string }[]
      }
      rpc_adjust_account_balance: {
        Args: { p_account_id: string; p_real_amount: number | string; p_mode: 'movement' | 'opening'; p_occurred_on?: string | null }
        Returns: number
      }
      rpc_delete_account: {
        Args: { p_account_id: string }
        Returns: undefined
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
        Args: {
          p_fixed_expense_id: string
          p_period: string
          p_amount?: number | string | null
          p_note?: string | null
          p_account_id?: string | null
          p_occurred_on?: string | null
        }
        Returns: undefined
      }
      rpc_unmark_fixed_expense_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      rpc_add_fixed_expense_saving: {
        Args: {
          p_fixed_expense_id: string
          p_period: string
          p_amount: number | string
          p_generate_movement?: boolean
          p_note?: string | null
          p_account_id?: string | null
          p_occurred_on?: string | null
        }
        Returns: undefined
      }
      rpc_remove_fixed_expense_saving: {
        Args: { p_saving_id: string }
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
        Args: { p_max_uses?: number; p_expires_at?: string | null; p_plan?: Plan }
        Returns: { code: string; max_uses: number; expires_at: string | null; plan: Plan }[]
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
          plan: Plan
        }[]
      }
      rpc_admin_delete_invite_code: {
        Args: { p_code: string }
        Returns: undefined
      }
      rpc_admin_list_users: {
        Args: Record<string, never>
        Returns: {
          id: string
          email: string | null
          display_name: string | null
          role: Role
          plan: Plan
          created_at: string
          last_sign_in_at: string | null
          transaction_count: number
        }[]
      }
      rpc_admin_set_user_plan: {
        Args: { p_user_id: string; p_plan: Plan }
        Returns: undefined
      }
      rpc_admin_set_user_role: {
        Args: { p_user_id: string; p_role: Role }
        Returns: undefined
      }
      rpc_admin_delete_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      rpc_admin_delete_users: {
        Args: { p_user_ids: string[] }
        Returns: undefined
      }
      rpc_reorder_default_categories: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      v_credit_installments: {
        Args: { p_period: string }
        Returns: {
          card_id: string | null
          purchase_id: string
          description: string
          installment_no: number
          installments: number
          amount: string
          category_id: string | null
        }[]
      }
      // Igual que `v_credit_installments`, más `period` (mes que toca) y `due_on` (vencimiento ya
      // materializado con `due_date_in_month`) — lo que permite filtrar por ciclo en vez de por mes
      // completo. Ver `20260911030001_cycle_range_functions.sql`.
      v_credit_installments_range: {
        Args: { p_from: string; p_to: string }
        Returns: {
          card_id: string | null
          purchase_id: string
          description: string
          installment_no: number
          installments: number
          amount: string
          category_id: string | null
          period: string
          due_on: string
        }[]
      }
      rpc_mark_credit_card_paid: {
        Args: { p_card_id: string; p_period: string; p_account_id?: string | null }
        Returns: undefined
      }
      rpc_unmark_credit_card_paid: {
        Args: { p_card_id: string; p_period: string }
        Returns: undefined
      }
      rpc_mark_credit_purchase_paid: {
        Args: { p_purchase_id: string; p_period: string; p_account_id?: string | null }
        Returns: undefined
      }
      rpc_unmark_credit_purchase_paid: {
        Args: { p_purchase_id: string; p_period: string }
        Returns: undefined
      }
      rpc_register_receivable_payment: {
        Args: {
          p_receivable_id: string
          p_amount: number | string
          p_occurred_on?: string | null
          p_category_id?: string | null
          p_create_income?: boolean | null
          p_account_id?: string | null
        }
        Returns: undefined
      }
      rpc_delete_receivable_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      rpc_create_receivable: {
        Args: {
          p_name: string
          p_amount: number | string
          p_expected_period?: string | null
          p_note?: string | null
          p_already_expensed?: boolean
          p_expense_amount?: number | string | null
          p_expense_category_id?: string | null
          p_expense_occurred_on?: string | null
          p_expense_description?: string | null
          p_account_id?: string | null
        }
        Returns: string
      }
      rpc_expense_receivable: {
        Args: {
          p_receivable_id: string
          p_category_id?: string | null
          p_occurred_on?: string | null
          p_account_id?: string | null
        }
        Returns: undefined
      }
      rpc_unexpense_receivable: {
        Args: { p_receivable_id: string }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
