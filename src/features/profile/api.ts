import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Database } from '@/lib/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type Role = ProfileRow['role']
export type Plan = ProfileRow['plan']
export type CycleKind = ProfileRow['cycle_kind']

export interface Profile {
  id: string
  displayName: string | null
  currency: string
  role: Role
  plan: Plan
  /** Ciclo de caja elegido — la ventana con la que este usuario mira su plata (`src/lib/cycle.ts`).
   *  'monthly' es el default de toda cuenta que no configuró nada: preserva exactamente el
   *  comportamiento de siempre. */
  cycleKind: CycleKind
  /** Sólo importa con `cycleKind === 'weekly'`. 1 = lunes … 7 = domingo (ISO). */
  cycleWeekStartsOn: number
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    currency: row.currency,
    role: row.role,
    plan: row.plan,
    cycleKind: row.cycle_kind,
    cycleWeekStartsOn: row.cycle_week_starts_on,
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
  cycleKind?: CycleKind
  cycleWeekStartsOn?: number
}

export function useUpdateProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      if (!user) throw new Error('No autenticado')
      const payload: Database['public']['Tables']['profiles']['Update'] = {}
      if (input.cycleKind !== undefined) payload.cycle_kind = input.cycleKind
      if (input.cycleWeekStartsOn !== undefined) payload.cycle_week_starts_on = input.cycleWeekStartsOn
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })
}
