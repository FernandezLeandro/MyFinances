import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

export type Asset = Database['public']['Tables']['assets']['Row']
export type AssetClass = Asset['asset_class']
export type AssetQuoteCurrency = Asset['quote_currency']

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

/**
 * Precio manual por activo, cargado por esta cuenta — igual que `profiles.usd_rate_manual`, es una
 * referencia propia, no un dato compartido: dos cuentas pueden tener valores distintos para el mismo
 * MELI del catálogo global. Devuelve un mapa por `asset_id` para resolverlo rápido en `useAssetPrices`.
 */
export function useAssetManualPrices() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['asset-manual-prices', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('asset_manual_prices').select('*')
      if (error) throw error
      const map = new Map<string, { priceArsCents: number; updatedAt: string }>()
      for (const row of data) {
        map.set(row.asset_id, { priceArsCents: centsFromNumeric(row.price_ars), updatedAt: row.updated_at })
      }
      return map
    },
  })
}

export interface AssetInput {
  symbol: string
  name: string
  assetClass: Exclude<AssetClass, 'fiat'>
  quoteCurrency: AssetQuoteCurrency
}

export function useCreateAsset() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AssetInput) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('assets').insert({
        user_id: user.id,
        symbol: input.symbol.trim().toUpperCase(),
        name: input.name.trim(),
        asset_class: input.assetClass,
        quote_currency: input.quoteCurrency,
        // Un activo agregado a mano siempre arranca sin cotización en vivo — el usuario la carga
        // él mismo en Ajustes. 8 decimales para cripto (estilo satoshi), 2 para el resto.
        decimals: input.assetClass === 'crypto' ? 8 : 2,
        price_source: 'manual',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', user?.id] }),
  })
}

export function useUpdateAssetManualPrice() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, priceArsCents }: { assetId: string; priceArsCents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('asset_manual_prices').upsert(
        {
          user_id: user.id,
          asset_id: assetId,
          price_ars: centsToNumeric(priceArsCents),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,asset_id' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['asset-manual-prices', user?.id] }),
  })
}
