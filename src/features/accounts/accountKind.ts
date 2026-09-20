import { Banknote, CreditCard, Wallet } from 'lucide-react'
import type { AccountKind } from '@/features/accounts/api'

/** Ícono por tipo de cuenta — sólo decorativo, ningún cálculo mira `kind`. En su propio archivo
 *  (no en `AccountSelect.tsx`) para no mezclar un export de función con el de un componente, que
 *  rompe el fast refresh de Vite. */
export function accountKindIcon(kind: AccountKind) {
  if (kind === 'wallet') return Wallet
  if (kind === 'bank') return CreditCard
  return Banknote
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Efectivo',
  wallet: 'Billetera virtual',
  bank: 'Banco',
}

export const ACCOUNT_KIND_NAME_PLACEHOLDER: Record<AccountKind, string> = {
  cash: 'Efectivo',
  wallet: 'Mercado Pago, Ualá…',
  bank: 'ICBC, Galicia…',
}
