import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Plan } from '@/features/access/plan'

export interface InviteCode {
  code: string
  maxUses: number
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  plan: Plan
}

export function codeStatus(code: InviteCode) {
  if (!code.isActive) return { label: 'Revocado', tone: 'text-fg-muted' }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) return { label: 'Vencido', tone: 'text-negative' }
  if (code.usedCount >= code.maxUses) return { label: 'Agotado', tone: 'text-negative' }
  return { label: 'Activo', tone: 'text-accent' }
}

/** Sólo el admin puede crear (la base lo exige, `is_admin()`) — se invalida la lista admin al pegarle. */
export function useCreateInviteCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { maxUses: number; expiresAt: string | null; plan: Plan }) => {
      const { data, error } = await supabase.rpc('rpc_create_invite_code', {
        p_max_uses: input.maxUses,
        p_expires_at: input.expiresAt,
        p_plan: input.plan,
      })
      if (error) throw error
      return data?.[0]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invite-codes', user?.id] }),
  })
}

/** Todas las invitaciones del sistema, no sólo las que creó esta cuenta — sólo el admin ve algo acá. */
export function useAdminInviteCodes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['admin-invite-codes', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<InviteCode[]> => {
      const { data, error } = await supabase.rpc('rpc_admin_list_invite_codes')
      if (error) throw error
      return (data ?? []).map((row) => ({
        code: row.code,
        maxUses: row.max_uses,
        usedCount: row.used_count,
        expiresAt: row.expires_at,
        isActive: row.is_active,
        createdAt: row.created_at,
        plan: row.plan,
      }))
    },
  })
}

export function useAdminDeleteInviteCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('rpc_admin_delete_invite_code', { p_code: code })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-invite-codes', user?.id] }),
  })
}
