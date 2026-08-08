/**
 * Store de toasts a nivel de módulo, no de contexto de React — tiene que ser llamable desde
 * `MutationCache({ onError })` en `main.tsx`, que vive fuera del árbol de componentes.
 * `ToastHost` se suscribe con `useSyncExternalStore`.
 */

export interface Toast {
  id: number
  message: string
  tone: 'error' | 'ok'
}

const DURATIONS: Record<Toast['tone'], number> = { error: 6000, ok: 3000 }
const MAX_TOASTS = 3

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener()
}

function scheduleDismiss(id: number, tone: Toast['tone']) {
  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => dismissToast(id), DURATIONS[tone]),
  )
}

export function showToast(message: string, tone: Toast['tone'] = 'error'): void {
  // Dedupe por mensaje: un error que se repite (p.ej. un reintento) reinicia el timer del que ya
  // está en pantalla en vez de apilar uno idéntico al lado.
  const existing = toasts.find((t) => t.message === message)
  if (existing) {
    scheduleDismiss(existing.id, existing.tone)
    return
  }

  const toast: Toast = { id: nextId++, message, tone }
  toasts = [...toasts, toast].slice(-MAX_TOASTS)
  scheduleDismiss(toast.id, tone)
  emit()
}

export function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

export function subscribeToasts(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** Referencia estable si no cambió nada — lo exige `useSyncExternalStore`, si no entra en loop. */
export function getToasts(): Toast[] {
  return toasts
}
