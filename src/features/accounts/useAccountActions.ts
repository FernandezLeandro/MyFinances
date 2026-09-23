import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import { useArchiveAccount, useSetDefaultBalanceLocation, type BalanceLocation } from '@/features/accounts/api'
import { archiveResultText, reactivateResultText } from '@/features/accounts/aggregate'

/**
 * Las acciones de Cuentas que no tienen diálogo — predeterminar, archivar, reactivar. Se aplican al
 * instante y el resultado se avisa con un toast (patrón 5a): el éxito dice qué pasó y la falla trae
 * un `Reintentar` que repite la misma acción. Las de un diálogo, en cambio, fallan adentro de él —
 * como borrar una transferencia, que pasa por `TransferDetailDialog` porque puede dejar la cuenta
 * destino en negativo.
 *
 * Sin `Deshacer` a propósito: sólo vale donde la reversa es barata y se decidió no hacerlo todavía.
 */
export function useAccountActions() {
  const setDefault = useSetDefaultBalanceLocation()
  const archive = useArchiveAccount()

  function makeDefault(account: BalanceLocation) {
    setDefault.mutate(account.id, {
      onSuccess: () =>
        showToast('Cuenta predeterminada', 'ok', { detail: `${account.name || 'La cuenta'} viene elegida al cargar algo nuevo.` }),
      onError: (error) =>
        showToast('No se pudo cambiar la predeterminada', 'error', {
          detail: mensajeDeError(error),
          action: { label: 'Reintentar', onClick: () => makeDefault(account) },
        }),
    })
  }

  function archiveAccount(account: BalanceLocation, balanceCents: number) {
    archive.mutate(
      { id: account.id, archived: true },
      {
        onSuccess: () => {
          const { title, detail } = archiveResultText(account.name, balanceCents)
          showToast(title, 'ok', { detail })
        },
        onError: (error) =>
          showToast('No se pudo archivar', 'error', {
            detail: mensajeDeError(error),
            action: { label: 'Reintentar', onClick: () => archiveAccount(account, balanceCents) },
          }),
      },
    )
  }

  function reactivateAccount(account: BalanceLocation, balanceCents: number) {
    archive.mutate(
      { id: account.id, archived: false },
      {
        onSuccess: () => {
          const { title, detail } = reactivateResultText(account.name, balanceCents)
          showToast(title, 'ok', { detail })
        },
        onError: (error) =>
          showToast('No se pudo reactivar', 'error', {
            detail: mensajeDeError(error),
            action: { label: 'Reintentar', onClick: () => reactivateAccount(account, balanceCents) },
          }),
      },
    )
  }

  return { makeDefault, archiveAccount, reactivateAccount }
}
