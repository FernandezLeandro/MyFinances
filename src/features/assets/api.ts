import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { DollarType } from '@/features/fx/quotes'
import type { Database } from '@/lib/database.types'

export type Asset = Database['public']['Tables']['assets']['Row']
export type AssetClass = Asset['asset_class']

/** Catálogo global (BTC, USD, MELI...) + los activos propios que el usuario haya agregado. */
export function useAssets(includeArchived = false) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['assets', user?.id, includeArchived],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from('assets').select('*').order('symbol')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export interface AssetInput {
  symbol: string
  name: string
  assetClass: Exclude<AssetClass, 'fiat'>
}

export function useCreateAsset() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AssetInput) => {
      if (!user) throw new Error('No autenticado')
      // Decisión temporal: todo lo que se agrega desde acá queda GLOBAL (user_id null), visible para
      // cualquier cuenta — no privado de quien lo creó. Se puede revisar más adelante.
      const { error } = await supabase.from('assets').insert({
        user_id: null,
        symbol: input.symbol.trim().toUpperCase(),
        name: input.name.trim(),
        asset_class: input.assetClass,
        // Arranca sin precio: el admin lo carga en USD al editarlo. 8 decimales para cualquier activo
        // que no sea dinero: comprar fracciones finas (acciones, bonos, cripto) es más la regla.
        decimals: 8,
        price_source: 'manual',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', user?.id] }),
  })
}

export interface AssetUpdateInput {
  name?: string
  assetClass?: Exclude<AssetClass, 'fiat'>
  /** USD por unidad. `null` lo borra. Sólo tiene efecto en los que no traen precio en vivo. */
  priceUsd?: number | null
  /** Dólar con el que se convierte este activo a pesos. */
  fxSource?: DollarType
  isArchived?: boolean
}

/** Edita el activo (nombre, clase, precio en USD, dólar de conversión, archivado). Sólo el admin: la
 *  base lo exige (`assets_update_global`). El símbolo no se puede cambiar — varias partes del código
 *  lo usan para identificar ARS/USD. */
export function useUpdateAsset() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: AssetUpdateInput & { id: string }) => {
      const { error } = await supabase
        .from('assets')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.assetClass !== undefined && { asset_class: input.assetClass }),
          ...(input.priceUsd !== undefined && {
            price_usd: input.priceUsd,
            price_updated_at: input.priceUsd == null ? null : new Date().toISOString(),
          }),
          ...(input.fxSource !== undefined && { fx_source: input.fxSource }),
          ...(input.isArchived !== undefined && { is_archived: input.isArchived }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', user?.id] }),
  })
}

/** Sólo activos globales (RLS ya lo exige) — si está en uso en alguna `investments`, el FK sin
 *  `on delete` frena el borrado y esto tira error en vez de arrastrar movimientos de otra cuenta. */
export function useDeleteAsset() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', user?.id] }),
  })
}
