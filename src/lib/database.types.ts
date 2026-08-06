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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; currency: string; created_at: string }
        Insert: { id: string; display_name?: string | null; currency?: string }
        Update: { display_name?: string | null; currency?: string }
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
      rpc_mark_fixed_expense_paid: {
        Args: { p_fixed_expense_id: string; p_period: string }
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
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
