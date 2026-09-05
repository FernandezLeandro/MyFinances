import { useEffect, useRef, useState } from 'react'
import { useBalanceLocations } from '@/features/reconciliation/api'

/**
 * Estado de "con qué lo pagué" para los diálogos de pago que no usan react-hook-form (Fijos,
 * Créditos, Me Deben). Arranca en `''` y se autocompleta con la cuenta predeterminada apenas
 * `useBalanceLocations` resuelve — pero sólo mientras el usuario no haya tocado el selector, para
 * que una carga lenta de esa query nunca pise una elección manual (incluida "Sin asignar", que
 * también vale `''`).
 *
 * Mismo bug que `TransactionFormDialog`/`ReceivableFormDialog` resuelven con `dirtyFields` de RHF:
 * ahí un `reset()` disparado por `defaultAccountId` llegando tarde borraba TODO el formulario, no
 * sólo la cuenta — se descubrió con un E2E que llenaba el form más rápido que el fetch de cuentas.
 * Acá no hay formulario alrededor, así que el guard es un ref de "tocado" en vez de `dirtyFields`.
 */
export function useDefaultAccountId(): [string, (id: string) => void] {
  const { data: locations } = useBalanceLocations()
  const defaultAccountId = locations?.find((l) => l.is_default)?.id ?? ''
  const [accountId, setAccountIdState] = useState('')
  const touchedRef = useRef(false)

  useEffect(() => {
    if (touchedRef.current || !defaultAccountId) return
    setAccountIdState(defaultAccountId)
  }, [defaultAccountId])

  function setAccountId(id: string) {
    touchedRef.current = true
    setAccountIdState(id)
  }

  return [accountId, setAccountId]
}
