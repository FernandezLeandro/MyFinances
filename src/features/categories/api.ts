import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Database } from '@/lib/database.types'

export type Category = Database['public']['Tables']['categories']['Row']
export type CategoryKind = Category['kind']

/** Sentinel para "sin categoría" en filtros y agrupaciones (donut, promedio mensual) — un id de
 *  categoría real nunca es esta string (son uuid), así que convive sin ambigüedad con ids reales en
 *  el mismo array. Mismo patrón que `UNASSIGNED_ACCOUNT_ID` en `transactions/api.ts`. La categoría
 *  en sí es opcional en toda la app (Bloque 2 del plan "BASIC centrado en fijos"): un movimiento,
 *  fijo o compra sin categoría se agrupa bajo "Sin categoría" en vez de exigir que el usuario
 *  elija una. */
export const UNCATEGORIZED_ID = '__sin-categoria__'

export function useCategories(includeArchived = false) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['categories', user?.id, includeArchived],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from('categories').select('*').order('name')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useCreateCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; kind: CategoryKind; color: string }) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('categories')
        .insert({ user_id: user.id, ...input })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}

export function useUpdateCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name: string; kind: CategoryKind; color: string }) => {
      const { error } = await supabase.from('categories').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}

/** Archivar o reactivar — sus movimientos ya cargados no se tocan, sólo deja de ofrecerse en los
 *  selectores de alta de un movimiento nuevo. */
export function useSetCategoryArchived() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isArchived }: { id: string; isArchived: boolean }) => {
      const { error } = await supabase.from('categories').update({ is_archived: isArchived }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}

/** Uso de cada categoría desglosado por origen — para "Sin usar"/"En uso" del arquetipo 4 y para que
 *  los avisos de archivar/eliminar sean honestos sobre qué se ve afectado (no sólo movimientos: un
 *  fijo o una compra en cuotas también referencian `category_id`). Tres selects de una sola columna
 *  (no la fila entera) y se cuenta del lado del cliente: no hay vista con el agregado ya armado, y el
 *  volumen de una cuenta normal no justifica una migración sólo para esto. */
export interface CategoryUsage {
  transactions: number
  fixedExpenses: number
  creditPurchases: number
  total: number
}

function countByCategory(rows: { category_id: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.category_id) continue
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
  }
  return counts
}

export function useCategoryUsageCounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['category-usage-counts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [transactionsRes, fixedExpensesRes, creditPurchasesRes] = await Promise.all([
        supabase.from('transactions').select('category_id').not('category_id', 'is', null),
        supabase.from('fixed_expenses').select('category_id').not('category_id', 'is', null),
        supabase.from('credit_purchases').select('category_id').not('category_id', 'is', null),
      ])
      if (transactionsRes.error) throw transactionsRes.error
      if (fixedExpensesRes.error) throw fixedExpensesRes.error
      if (creditPurchasesRes.error) throw creditPurchasesRes.error

      const transactions = countByCategory(transactionsRes.data)
      const fixedExpenses = countByCategory(fixedExpensesRes.data)
      const creditPurchases = countByCategory(creditPurchasesRes.data)

      const ids = new Set([...transactions.keys(), ...fixedExpenses.keys(), ...creditPurchases.keys()])
      const usage = new Map<string, CategoryUsage>()
      for (const id of ids) {
        const t = transactions.get(id) ?? 0
        const f = fixedExpenses.get(id) ?? 0
        const c = creditPurchases.get(id) ?? 0
        usage.set(id, { transactions: t, fixedExpenses: f, creditPurchases: c, total: t + f + c })
      }
      return usage
    },
  })
}

/** Borrado definitivo — a diferencia de archivar, esto no se puede deshacer. Todas las FK a
 *  `categories` (transactions, fixed_expenses, credit_purchases, credit_card_payment_items) son
 *  `on delete set null`: los registros que tenía no se borran, quedan agrupados bajo "Sin categoría"
 *  (`UNCATEGORIZED_ID`) igual que un movimiento que nunca tuvo una. */
export function useDeleteCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['category-usage-counts', user?.id] })
      // Sus movimientos, fijos y compras pasan a mostrarse como "Sin categoría" — refrescar todo lo
      // que agrupa o muestra por categoría.
      queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['spend-by-category', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['fixed-expenses', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['credit-purchases', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['standalone-purchases', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['credit-installments', user?.id] })
    },
  })
}
