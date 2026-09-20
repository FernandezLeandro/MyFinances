import { useCan } from '@/features/access/useCan'
import { useBalanceLocations } from '@/features/accounts/api'
import { effectiveDefaultAccountId } from '@/features/accounts/aggregate'

/**
 * Si un formulario que genera un movimiento tiene que pedir cuenta, y cuál viene elegida.
 *
 * Se pide cuenta cuando el plan tiene Cuentas y ya existe al menos una activa — un Test que todavía
 * no creó su primera cuenta no ve ningún selector (sus movimientos siguen sin cuenta, como siempre).
 * Un plan sin Cuentas (Básico) tampoco: la base completa la cuenta sola en ese caso (trigger
 * `transactions_account`).
 */
export function useAccountPicker(): { show: boolean; defaultId: string } {
  const canCuentas = useCan('cuentas')
  const { data: locations } = useBalanceLocations()
  const all = locations ?? []
  return {
    show: canCuentas && all.some((l) => !l.is_archived),
    defaultId: effectiveDefaultAccountId(all),
  }
}
