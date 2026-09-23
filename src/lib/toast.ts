/**
 * Store de toasts a nivel de módulo, no de contexto de React — tiene que ser llamable desde
 * `MutationCache({ onError })` en `main.tsx`, que vive fuera del árbol de componentes.
 * `ToastHost` se suscribe con `useSyncExternalStore`.
 */

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  /** El título: la línea que se lee de un vistazo. */
  message: string
  tone: 'error' | 'ok'
  /** La línea de abajo, más chica: el dato concreto ("Efectivo queda en $ 12.400,00"). */
  detail?: string
  /** Un botón dentro del aviso — `Reintentar` en un error de una acción sin diálogo. */
  action?: ToastAction
}

export interface ToastOptions {
  detail?: string
  action?: ToastAction
}

const DURATIONS: Record<Toast['tone'], number> = { error: 6000, ok: 4000 }

/** Un aviso con botón no se va solo: si se apagara a los 6s, el `Reintentar` desaparecería justo
 *  cuando alguien lo está buscando. Se cierra con la X o al accionarlo. */
function isPersistent(toast: Pick<Toast, 'action'>): boolean {
  return toast.action !== undefined
}
const MAX_TOASTS = 3

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener()
}

function scheduleDismiss(toast: Toast) {
  const existing = timers.get(toast.id)
  if (existing) clearTimeout(existing)
  if (isPersistent(toast)) return
  timers.set(
    toast.id,
    setTimeout(() => dismissToast(toast.id), DURATIONS[toast.tone]),
  )
}

export function showToast(message: string, tone: Toast['tone'] = 'error', options: ToastOptions = {}): void {
  // Dedupe por título + detalle: un error que se repite (p.ej. un reintento) reinicia el timer del
  // que ya está en pantalla en vez de apilar uno idéntico al lado. Dos avisos con el mismo título
  // pero otro detalle ("Saldo reajustado" de dos cuentas) son distintos y conviven.
  const existing = toasts.find((t) => t.message === message && t.detail === options.detail)
  if (existing) {
    scheduleDismiss(existing)
    return
  }

  const toast: Toast = { id: nextId++, message, tone, detail: options.detail, action: options.action }
  toasts = [...toasts, toast].slice(-MAX_TOASTS)
  scheduleDismiss(toast)
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
