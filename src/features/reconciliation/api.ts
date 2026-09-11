import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/auth-context'
import { centsFromNumeric, centsToNumeric } from '@/lib/money'
import type { Database } from '@/lib/database.types'

type BalanceLocationRowRaw = Database['public']['Tables']['balance_locations']['Row']
export type AccountKind = BalanceLocationRowRaw['kind']
export interface BalanceLocation extends Omit<BalanceLocationRowRaw, 'amount' | 'opening_amount'> {
  amountCents: number
  openingCents: number
}
function toBalanceLocation(row: BalanceLocationRowRaw): BalanceLocation {
  const { amount, opening_amount, ...rest } = row
  return { ...rest, amountCents: centsFromNumeric(amount), openingCents: centsFromNumeric(opening_amount) }
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

/** Dónde tiene la plata el usuario — pocas filas, sin período: siempre "el estado actual".
 *  Archivadas al final: siguen existiendo (movimientos viejos las referencian) pero no hay que
 *  verlas primero al elegir cuenta. */
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

/** Saldo DERIVADO de cada cuenta (apertura + movimientos imputados ± transferencias) — diagnóstico
 *  de "en qué cuenta está la plata", separado a propósito del `amountCents` declarado a mano en
 *  `BalanceLocation`. Ver el comentario de cabecera de la migración `cuentas_y_medios_de_pago`. */
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

// ---------------------------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------------------------

/** Alta/edición/borrado de lugares — no toca el saldo en sí (eso sólo se mueve generando el
 *  movimiento de ajuste vía `useCreateTransaction`), así que no hace falta invalidar
 *  transactions/balance acá. El saldo DERIVADO (`account-balances`) tampoco: cambiar el nombre, el
 *  tipo o la apertura de una cuenta no cambia ningún movimiento imputado a ella — salvo la apertura
 *  misma, que si se toca sí la invalida (ver `useUpdateBalanceLocation`). */
function invalidarLugares(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['balance-locations', userId] })
}

export function useCreateBalanceLocation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    // `openingCents`: lo que ya tenías al crear la cuenta (22b, `OpeningAmountField`) — se guarda
    // como apertura Y como real declarado, así que Cuadrar Saldo la ve coincidiendo desde el vamos
    // en vez de mostrar un desvío falso contra un `amount` en $0 que nadie declaró.
    mutationFn: async (input: { name: string; cents: number; kind?: AccountKind; openingCents?: number }) => {
      if (!user) throw new Error('No autenticado')
      const { data, error } = await supabase
        .from('balance_locations')
        .insert({
          user_id: user.id,
          name: input.name,
          amount: centsToNumeric(input.cents),
          opening_amount: centsToNumeric(input.openingCents ?? 0),
          kind: input.kind,
        })
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
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string
      name?: string
      cents?: number
      kind?: AccountKind
      openingCents?: number
      isDefault?: boolean
      isArchived?: boolean
    }) => {
      const patch: Database['public']['Tables']['balance_locations']['Update'] = {
        updated_at: new Date().toISOString(),
      }
      if (input.name !== undefined) patch.name = input.name
      if (input.cents !== undefined) patch.amount = centsToNumeric(input.cents)
      if (input.kind !== undefined) patch.kind = input.kind
      if (input.openingCents !== undefined) patch.opening_amount = centsToNumeric(input.openingCents)
      if (input.isDefault !== undefined) patch.is_default = input.isDefault
      if (input.isArchived !== undefined) patch.is_archived = input.isArchived
      const { error } = await supabase.from('balance_locations').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      invalidarLugares(queryClient, user?.id)
      // La apertura es el único campo de esta tabla que el derivado de `account-balances` mira —
      // tocarla sin invalidar dejaría el saldo por cuenta viejo hasta el próximo refetch por otra vía.
      if (variables.openingCents !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['account-balances', user?.id] })
      }
    },
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
    onSuccess: () => {
      invalidarLugares(queryClient, user?.id)
      // Los movimientos que apuntaban acá quedan con account_id null (on delete set null) y pasan a
      // "Sin asignar" — su cuenta desapareció del mapa de account-balances.
      queryClient.invalidateQueries({ queryKey: ['account-balances', user?.id] })
    },
  })
}
