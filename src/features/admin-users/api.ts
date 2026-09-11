import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import type { Plan } from '@/features/access/plan'
import type { Role } from '@/features/profile/api'

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  role: Role
  plan: Plan
  createdAt: string
  lastSignInAt: string | null
  transactionCount: number
}

/** Todas las cuentas del sistema — sólo el admin ve algo acá (`is_admin()` adentro del RPC, no RLS
 *  por filas: hace falta ver TODAS las filas, no sólo la propia). */
export function useAdminUsers() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['admin-users', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc('rpc_admin_list_users')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        plan: row.plan,
        createdAt: row.created_at,
        lastSignInAt: row.last_sign_in_at,
        transactionCount: row.transaction_count,
      }))
    },
  })
}

export function useAdminSetUserPlan() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { userId: string; plan: Plan }) => {
      const { error } = await supabase.rpc('rpc_admin_set_user_plan', { p_user_id: input.userId, p_plan: input.plan })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users', user?.id] }),
  })
}

export function useAdminSetUserRole() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { userId: string; role: Role }) => {
      const { error } = await supabase.rpc('rpc_admin_set_user_role', { p_user_id: input.userId, p_role: input.role })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users', user?.id] }),
  })
}

/** Borra la cuenta entera — auth.users y en cascada todo lo que cargó (perfil, movimientos,
 *  fijos, cuentas, etc.; ver el comentario de la migración 20260911010003). No hay vuelta atrás. */
export function useAdminDeleteUser() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('rpc_admin_delete_user', { p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users', user?.id] }),
  })
}

/** Igual, para varias de una — un solo delete cascada del lado de la base, no un loop de mutaciones. */
export function useAdminDeleteUsers() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const { error } = await supabase.rpc('rpc_admin_delete_users', { p_user_ids: userIds })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users', user?.id] }),
  })
}
