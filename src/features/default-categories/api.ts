import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type DefaultCategory = Database['public']['Tables']['default_categories']['Row']
export type DefaultCategoryKind = DefaultCategory['kind']

/** El catálogo que arranca cada cuenta nueva (`rpc_redeem_invite_code` lo lee). 100% admin — la
 *  base ya lo bloquea para cualquier otra cuenta, esto sólo tiene sentido llamarlo siendo admin. */
export function useDefaultCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['default-categories', includeArchived],
    queryFn: async () => {
      let query = supabase.from('default_categories').select('*').order('sort_order')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export interface DefaultCategoryInput {
  name: string
  kind: DefaultCategoryKind
  color: string
  sortOrder: number
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['default-categories'] })
}

export function useCreateDefaultCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DefaultCategoryInput) => {
      const { error } = await supabase.from('default_categories').insert({
        name: input.name,
        kind: input.kind,
        color: input.color,
        sort_order: input.sortOrder,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

/** Persiste el nuevo orden tras arrastrar — una sola llamada atómica con el orden final de ids,
 *  no un update por fila: si algo falla, no deja el orden a mitad de camino. */
export function useReorderDefaultCategories() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc('rpc_reorder_default_categories', { p_ids: orderedIds })
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useUpdateDefaultCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DefaultCategoryInput> & { id: string; isArchived?: boolean }) => {
      const { error } = await supabase
        .from('default_categories')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.color !== undefined && { color: input.color }),
          ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
          ...(input.isArchived !== undefined && { is_archived: input.isArchived }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}
