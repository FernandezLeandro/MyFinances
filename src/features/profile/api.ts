import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type FxSource = ProfileRow['fx_source']
export type Role = ProfileRow['role']

export interface Profile {
  id: string
  displayName: string | null
  currency: string
  role: Role
  fxSource: FxSource
  /** Cotización manual en centavos de ARS por unidad de USD. `null` si nunca se cargó. */
  usdRateManualCents: number | null
  usdRateUpdatedAt: string | null
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    currency: row.currency,
    role: row.role,
    fxSource: row.fx_source,
    usdRateManualCents: row.usd_rate_manual == null ? null : centsFromNumeric(row.usd_rate_manual),
    usdRateUpdatedAt: row.usd_rate_updated_at,
  }
}

/**
 * `profiles` es 1:1 con el usuario — a lo sumo una fila. `maybeSingle()`, no `single()`: una cuenta
 * recién creada (o una que todavía no redimió su código de invitación) legítimamente no tiene perfil
 * todavía, y eso no es un error — es el estado que el guard de `/bienvenida` necesita distinguir.
 */
export function useProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
      if (error) throw error
      return data ? toProfile(data) : null
    },
  })
}

export interface ProfileUpdateInput {
  fxSource?: FxSource
  usdRateManualCents?: number | null
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      if (!user) throw new Error('No autenticado')
      const payload: Database['public']['Tables']['profiles']['Update'] = {}
      if (input.fxSource !== undefined) payload.fx_source = input.fxSource
      if (input.usdRateManualCents !== undefined) {
        payload.usd_rate_manual =
          input.usdRateManualCents == null ? null : centsToNumeric(input.usdRateManualCents)
        payload.usd_rate_updated_at = new Date().toISOString()
      }
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}
