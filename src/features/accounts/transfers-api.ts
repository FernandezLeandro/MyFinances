import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type TransferRowRaw = Database['public']['Tables']['account_transfers']['Row']
export interface AccountTransfer extends Omit<TransferRowRaw, 'amount'> {
  cents: number
}
function toTransfer(row: TransferRowRaw): AccountTransfer {
  const { amount, ...rest } = row
  return { ...rest, cents: centsFromNumeric(amount) }
}

/** Movimientos entre cuentas propias — no son gasto ni ingreso, así que viven en su propia tabla y
 *  jamás tocan `transactions`, `balance` ni `monthly-summary`. Ver el comentario de la migración
 *  `cuentas_y_medios_de_pago` para el porqué de la tabla separada. */
export function useAccountTransfers() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['account-transfers', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_transfers')
        .select('*')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(toTransfer)
    },
  })
}

function invalidarTransfers(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['account-transfers', userId] })
  // Sólo el derivado por cuenta se mueve — el saldo global, `monthly-summary` y `spend-by-category`
  // no ven transferencias, a propósito (no son gasto ni ingreso).
  queryClient.invalidateQueries({ queryKey: ['account-balances', userId] })
}

export function useCreateAccountTransfer() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true }, // ver `mutationMeta` en main.tsx: el diálogo de transferir muestra la falla
    mutationFn: async (input: {
      fromAccountId: string
      toAccountId: string
      cents: number
      occurredOn: string
      description: string | null
    }) => {
      if (!user) throw new Error('No autenticado')
      const { error } = await supabase.from('account_transfers').insert({
        user_id: user.id,
        from_account_id: input.fromAccountId,
        to_account_id: input.toAccountId,
        amount: centsToNumeric(input.cents),
        occurred_on: input.occurredOn,
        description: input.description,
      })
      if (error) throw error
    },
    onSuccess: () => invalidarTransfers(queryClient, user?.id),
  })
}

export function useDeleteAccountTransfer() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true }, // ver `mutationMeta` en main.tsx: la pantalla avisa con un toast propio
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_transfers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarTransfers(queryClient, user?.id),
  })
}
