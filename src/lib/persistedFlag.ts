import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Map<string, Set<() => void>>()

function read(storageKey: string): boolean {
  return localStorage.getItem(storageKey) === '1'
}

function subscribe(storageKey: string, callback: () => void) {
  let set = listeners.get(storageKey)
  if (!set) {
    set = new Set()
    listeners.set(storageKey, set)
  }
  set.add(callback)
  return () => set.delete(callback)
}

/**
 * Fábrica de un flag booleano persistido en localStorage bajo `namespace:<key>`, con un mini pub-sub
 * vía `useSyncExternalStore` en vez de sólo `useState` — necesario cuando el mismo flag se renderiza
 * en más de un lugar a la vez (p. ej. "saldo oculto" en Hoy y en la nav, o el sidebar colapsado en el
 * propio riel y en el botón que lo togglea) y togglear en uno tiene que actualizar el otro sin esperar
 * a un remount.
 */
export function createPersistedFlag(namespace: string) {
  return function usePersistedFlag(key: string): [boolean, () => void] {
    const storageKey = `${namespace}:${key}`
    const value = useSyncExternalStore(
      (callback) => subscribe(storageKey, callback),
      () => read(storageKey),
    )

    const toggle = useCallback(() => {
      localStorage.setItem(storageKey, read(storageKey) ? '0' : '1')
      listeners.get(storageKey)?.forEach((cb) => cb())
    }, [storageKey])

    return [value, toggle]
  }
}
