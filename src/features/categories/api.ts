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

/** Cuántos movimientos tiene cada categoría — para "Sin usar" y "En uso" del arquetipo 4. Trae sólo
 *  la columna `category_id` (no todo el movimiento) y cuenta del lado del cliente: no hay vista con
 *  el agregado ya armado, y la tabla de un usuario normal no justifica una migración sólo para esto. */
export function useCategoryUsageCounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['category-usage-counts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('category_id').not('category_id', 'is', null)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data) {
        if (!row.category_id) continue
        counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
      }
      return counts
    },
  })
}
