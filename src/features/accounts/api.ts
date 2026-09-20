import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import { invalidateTransactionQueries } from '@/features/transactions/api'
import type { Database } from '@/lib/database.types'

type BalanceLocationRowRaw = Database['public']['Tables']['balance_locations']['Row']
export type AccountKind = BalanceLocationRowRaw['kind']

/** `amount` (el "real declarado" de Cuadrar saldo) ya no se lee: quedó obsoleta al pasar el saldo a
 *  ser la suma de las cuentas (ver la migración `cuentas_saldo_y_reajuste`). */
export interface BalanceLocation extends Omit<BalanceLocationRowRaw, 'amount' | 'opening_amount'> {
  openingCents: number
}
function toBalanceLocation(row: BalanceLocationRowRaw): BalanceLocation {
  const { amount: _obsolete, opening_amount, ...rest } = row
  return { ...rest, openingCents: centsFromNumeric(opening_amount) }
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

/** Las cuentas del usuario — pocas filas, sin período: siempre "el estado actual". Archivadas al
 *  final: siguen existiendo (no suman al saldo, pero los movimientos viejos las referencian) y no hay
 *  que verlas primero al elegir cuenta. */
export function useBalanceLocations() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['balance-locations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('balance_locations').select('*').order('is_archived').order('created_at')
      if (error) throw error
      return data.map(toBalanceLocation)
    },
  })
}

/** Saldo de cada cuenta (apertura + movimientos imputados ± transferencias). La suma de todas es el
 *  saldo actual de la app (`rpc_current_balance`). */
export function useAccountBalances() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['account-balances', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_account_balances')
      if (error) throw error
      const map = new Map<string, number>()
      for (const row of data ?? []) map.set(row.account_id, centsFromNumeric(row.derived))
      return map
    },
  })
}

/** Cuánto se lleva puesto eliminar una cuenta — para decirlo en la confirmación. Sólo corre con el
 *  diálogo abierto (`id` no nulo): son dos conteos que no hace falta pagar en cada visita. */
export function useAccountDeleteImpact(id: string | null) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['account-delete-impact', user?.id, id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const [transactionsRes, transfersRes] = await Promise.all([
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('account_id', id!),
        supabase
          .from('account_transfers')
          .select('id', { count: 'exact', head: true })
          .or(`from_account_id.eq.${id},to_account_id.eq.${id}`),
      ])
      if (transactionsRes.error) throw transactionsRes.error
      if (transfersRes.error) throw transfersRes.error
      return { transactions: transactionsRes.count ?? 0, transfers: transfersRes.count ?? 0 }
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------------------------

type QueryClient = ReturnType<typeof useQueryClient>

// Todas las mutaciones de cuentas son `silent` (ver `mutationMeta` en main.tsx): la pantalla de
// Cuentas es quien las llama y decide cómo avisar la falla — un bloque adentro del diálogo, o un
// aviso con `Reintentar` si la acción no tiene diálogo. Nunca los dos por el mismo fallo.

/** Lo que mueve cualquier cambio en las cuentas que toque el saldo: la lista, el saldo por cuenta,
 *  el saldo actual y el proyectado (que parte de él). */
function invalidarCuentasYSaldo(queryClient: QueryClient, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['balance-locations', userId] })
  queryClient.invalidateQueries({ queryKey: ['account-balances', userId] })
  queryClient.invalidateQueries({ queryKey: ['balance', userId] })
  queryClient.invalidateQueries({ queryKey: ['projected-balance-range', userId] })
}

/** La apertura es "cuánto tenés hoy" al crearla y no se vuelve a editar a mano: después sólo cambia
 *  con `useAdjustAccountBalance` en modo `opening`. La primera cuenta ACTIVA nace predeterminada,
 *  así los diálogos de pago ya traen una cuenta elegida; una cuenta nueva cuando ya hay otras no le
 *  quita el lugar (sin predeterminada explícita, la activa más vieja hace de tal — ver
 *  `effectiveDefaultAccountId`). */
export function useCreateBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (input: { name: string; kind: AccountKind; openingCents: number }) => {
      if (!user) throw new Error('No autenticado')
      const { count, error: countError } = await supabase
        .from('balance_locations')
        .select('id', { count: 'exact', head: true })
        .eq('is_archived', false)
      if (countError) throw countError
      const isFirstActive = (count ?? 0) === 0
      if (isFirstActive) {
        // El índice único parcial de `is_default` también cuenta las archivadas: si una quedó como
        // predeterminada (el cliente viejo archivaba sin apagarlo), hay que soltarla antes.
        const { error: clearError } = await supabase
          .from('balance_locations')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true)
        if (clearError) throw clearError
      }
      const { data, error } = await supabase
        .from('balance_locations')
        .insert({
          user_id: user.id,
          name: input.name,
          opening_amount: centsToNumeric(input.openingCents),
          kind: input.kind,
          is_default: isFirstActive,
        })
        .select()
        .single()
      if (error) throw error
      return toBalanceLocation(data)
    },
    // Crear la primera cuenta cambia de qué está hecho el saldo (de "suma de movimientos" a "suma de
    // cuentas"), así que también se refresca el saldo.
    onSuccess: () => invalidarCuentasYSaldo(queryClient, user?.id),
  })
}

/** Nombre y tipo — nada más. La apertura no se edita desde acá (ver `useCreateBalanceLocation`). */
export function useUpdateBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, name, kind }: { id: string; name: string; kind: AccountKind }) => {
      const { error } = await supabase
        .from('balance_locations')
        .update({ name, kind, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['balance-locations', user?.id] }),
  })
}

/** Prender la predeterminada apaga cualquier otra: el índice único parcial de la DB lo exige, así
 *  que hace falta apagar la anterior en el mismo flujo (dos updates, no un upsert: no hay forma de
 *  hacer un "toggle exclusivo" atómico sin un RPC dedicado, y tampoco hace falta — si el segundo
 *  update fallara a mitad de camino, el peor caso es quedar sin predeterminada, nunca con dos). */
export function useSetDefaultBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (id: string) => {
      if (!user) throw new Error('No autenticado')
      const { error: clearError } = await supabase
        .from('balance_locations')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
      if (clearError) throw clearError
      const { error } = await supabase.from('balance_locations').update({ is_default: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['balance-locations', user?.id] }),
  })
}

/** Archivar saca la cuenta de los selectores Y del saldo (`rpc_current_balance` sólo suma las activas);
 *  reactivarla la vuelve a sumar. Si era la predeterminada deja de serlo (un selector no puede traer
 *  una cuenta archivada) y pasa a serlo la activa más vieja. */
export function useArchiveAccount() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { data: row, error: readError } = await supabase.from('balance_locations').select('is_default').eq('id', id).single()
      if (readError) throw readError

      const patch: Database['public']['Tables']['balance_locations']['Update'] = {
        is_archived: archived,
        updated_at: new Date().toISOString(),
      }
      if (archived) patch.is_default = false
      const { error } = await supabase.from('balance_locations').update(patch).eq('id', id)
      if (error) throw error

      if (archived && row.is_default) {
        const { data: next, error: nextError } = await supabase
          .from('balance_locations')
          .select('id')
          .eq('is_archived', false)
          .neq('id', id)
          .order('created_at')
          .order('id')
          .limit(1)
          .maybeSingle()
        if (nextError) throw nextError
        if (next) {
          const { error: promoteError } = await supabase.from('balance_locations').update({ is_default: true }).eq('id', next.id)
          if (promoteError) throw promoteError
        }
      }
    },
    // Archivar o reactivar mueve el saldo de la app (y el proyectado, que parte de él), no sólo la lista.
    onSuccess: () => invalidarCuentasYSaldo(queryClient, user?.id),
  })
}

export type AdjustMode = 'movement' | 'opening'

/** Reajustar el saldo de una cuenta: la diferencia contra su saldo actual se registra como un
 *  movimiento de ajuste o corrige el saldo inicial. La diferencia la calcula la base
 *  (`rpc_adjust_account_balance`), no el cliente. Manda la fecha LOCAL: `current_date` de Supabase
 *  es UTC y en Argentina, desde las 21 h, ya es mañana. */
export function useAdjustAccountBalance() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (input: { accountId: string; realCents: number; mode: AdjustMode }) => {
      const { error } = await supabase.rpc('rpc_adjust_account_balance', {
        p_account_id: input.accountId,
        p_real_amount: centsToNumeric(input.realCents),
        p_mode: input.mode,
        p_occurred_on: format(new Date(), 'yyyy-MM-dd'),
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      invalidarCuentasYSaldo(queryClient, user?.id)
      // Con movimiento también cambian Movimientos, los resúmenes del ciclo y el donut.
      if (variables.mode === 'movement') invalidateTransactionQueries(queryClient, user?.id)
    },
  })
}

/** Elimina la cuenta con sus movimientos y transferencias (`rpc_delete_account`). Toca pagos de
 *  fijos, guardados y deudas, así que se invalida todo: es una acción rara y destructiva, no vale la
 *  pena afinar la lista. */
export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    meta: { silent: true },
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('rpc_delete_account', { p_account_id: id })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries(),
  })
}
