import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'

export interface InviteCode {
  code: string
  maxUses: number
  usedCount: number
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

export function useMyInviteCodes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['invite-codes', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<InviteCode[]> => {
      const { data, error } = await supabase.rpc('rpc_list_my_invite_codes')
      if (error) throw error
      return (data ?? []).map((row) => ({
        code: row.code,
        maxUses: row.max_uses,
        usedCount: row.used_count,
        expiresAt: row.expires_at,
        isActive: row.is_active,
        createdAt: row.created_at,
      }))
    },
  })
}

export function useCreateInviteCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { maxUses: number; expiresAt: string | null }) => {
      const { data, error } = await supabase.rpc('rpc_create_invite_code', {
        p_max_uses: input.maxUses,
        p_expires_at: input.expiresAt,
      })
      if (error) throw error
      return data?.[0]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invite-codes', user?.id] }),
  })
}

export function useDeactivateInviteCode() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.rpc('rpc_deactivate_invite_code', { p_code: code })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invite-codes', user?.id] }),
  })
}
