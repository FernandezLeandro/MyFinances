import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type BalanceLocationRowRaw = Database['public']['Tables']['balance_locations']['Row']
export interface BalanceLocation extends Omit<BalanceLocationRowRaw, 'amount'> {
  amountCents: number
}
function toBalanceLocation(row: BalanceLocationRowRaw): BalanceLocation {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

type ReceivableRowRaw = Database['public']['Tables']['receivables']['Row']
export interface Receivable extends Omit<ReceivableRowRaw, 'amount'> {
  amountCents: number
}
function toReceivable(row: ReceivableRowRaw): Receivable {
  const { amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount) }
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

/** Dónde tiene la plata el usuario — pocas filas, sin período: siempre "el estado actual". */
export function useBalanceLocations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['balance-locations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('balance_locations').select('*').order('created_at')
      if (error) throw error
      return data.map(toBalanceLocation)
    },
  })
}

/** Plata prestada, todavía sin cobrar — mismo criterio que balance_locations: pocas filas, sin
 *  período. No representa un movimiento (no hubo gasto), así que no toca `transactions`. */
export function useReceivables() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['receivables', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('receivables').select('*').order('created_at')
      if (error) throw error
      return data.map(toReceivable)
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------------------------

/** Alta/edición/borrado de lugares — no toca el saldo en sí (eso sólo se mueve generando el
 *  movimiento de ajuste vía `useCreateTransaction`), así que no hace falta invalidar
 *  transactions/balance acá. */
function invalidarLugares(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['balance-locations', userId] })
}

export function useCreateBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; cents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('balance_locations')
        .insert({ user_id: user.id, name: input.name, amount: centsToNumeric(input.cents) })
        .select()
        .single()
      if (error) throw error
      return toBalanceLocation(data)
    },
    onSuccess: () => invalidarLugares(queryClient, user?.id),
  })
}

export function useUpdateBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; cents?: number }) => {
      const patch: { name?: string; amount?: string; updated_at: string } = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.cents !== undefined) patch.amount = centsToNumeric(input.cents)
      const { error } = await supabase.from('balance_locations').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarLugares(queryClient, user?.id),
  })
}

export function useDeleteBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('balance_locations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarLugares(queryClient, user?.id),
  })
}

/** Alta/edición/borrado de deudas a favor — tampoco toca `transactions`/`balance`: prestar no es
 *  un movimiento (ver comentario de la migración), sólo cambia cuánto "Tenés" en el cuadre. */
function invalidarDeudas(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['receivables', userId] })
}

export function useCreateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { name: string; cents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('receivables')
        .insert({ user_id: user.id, name: input.name, amount: centsToNumeric(input.cents) })
        .select()
        .single()
      if (error) throw error
      return toReceivable(data)
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
  })
}

export function useUpdateReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; cents?: number }) => {
      const patch: { name?: string; amount?: string; updated_at: string } = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.cents !== undefined) patch.amount = centsToNumeric(input.cents)
      const { error } = await supabase.from('receivables').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
  })
}

export function useDeleteReceivable() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('receivables').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarDeudas(queryClient, user?.id),
  })
}
