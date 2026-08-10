import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Map<string, Set<() => void>>()

function storageKey(key: string) {
  return `hidden-balance:${key}`
}

function read(key: string): boolean {
  return localStorage.getItem(storageKey(key)) === '1'
}

function subscribe(key: string, callback: () => void) {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(callback)
  return () => set.delete(callback)
}

/**
 * Preferencia "ocultar saldo" persistida en localStorage, una por pantalla (`key` distinto para
 * saldo actual y Patrimonio, así ocultar uno no afecta al otro). Un mini pub-sub en vez de sólo
 * `useState`: el saldo actual se renderiza a la vez en Hoy y en la nav — sin esto, togglear en uno
 * no actualizaba el otro hasta el próximo remount.
 */
export function useHiddenBalance(key: string): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    (callback) => subscribe(key, callback),
    () => read(key),
  )

  const toggle = useCallback(() => {
    localStorage.setItem(storageKey(key), read(key) ? '0' : '1')
    listeners.get(key)?.forEach((cb) => cb())
  }, [key])

  return [hidden, toggle]
}
