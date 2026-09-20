import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El store es module-scope (no un hook, no un contexto — ver el comentario en toast.ts sobre por
// qué), así que su estado sobrevive entre tests salvo que se resetee el módulo a mano en cada uno.
let showToast: typeof import('./toast').showToast
let dismissToast: typeof import('./toast').dismissToast
let subscribeToasts: typeof import('./toast').subscribeToasts
let getToasts: typeof import('./toast').getToasts

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  const mod = await import('./toast')
  showToast = mod.showToast
  dismissToast = mod.dismissToast
  subscribeToasts = mod.subscribeToasts
  getToasts = mod.getToasts
})

afterEach(() => {
  vi.useRealTimers()
})

describe('showToast / getToasts', () => {
  it('agrega un toast con id, mensaje y tono', () => {
    showToast('algo falló', 'error')
    const toasts = getToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: 'algo falló', tone: 'error' })
  })

  it('tono por defecto es error', () => {
    showToast('sin tono explícito')
    expect(getToasts()[0].tone).toBe('error')
  })

  it('ids incrementales, no reusados entre toasts', () => {
    showToast('uno')
    showToast('dos')
    const [a, b] = getToasts()
    expect(b.id).toBeGreaterThan(a.id)
  })
})

describe('dedupe por mensaje', () => {
  it('un mensaje repetido no apila un segundo toast', () => {
    showToast('mismo error')
    showToast('mismo error')
    expect(getToasts()).toHaveLength(1)
  })

  it('el repetido reinicia el timer del que ya está en pantalla, no lo deja vencer', () => {
    showToast('mismo error', 'error') // dura 6000ms desde acá
    vi.advanceTimersByTime(5000) // todavía vivo (venció a los 6000ms desde el primer show)
    showToast('mismo error', 'error') // reinicia: ahora vence a los 5000+6000=11000ms
    vi.advanceTimersByTime(5500) // total 10500ms desde el inicio — sin el reset ya habría vencido a los 6000ms
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(600) // total 11100ms — ahora sí venció el segundo timer
    expect(getToasts()).toHaveLength(0)
  })
})

describe('máximo 3 toasts, FIFO', () => {
  it('el cuarto toast saca al más viejo', () => {
    showToast('1')
    showToast('2')
    showToast('3')
    showToast('4')
    const messages = getToasts().map((t) => t.message)
    expect(messages).toEqual(['2', '3', '4'])
  })
})

describe('dismissToast', () => {
  it('saca el toast de la lista', () => {
    showToast('chau')
    const id = getToasts()[0].id
    dismissToast(id)
    expect(getToasts()).toHaveLength(0)
  })

  it('cancela el auto-dismiss pendiente — no rompe si el timer ya no existe cuando dispara', () => {
    showToast('chau')
    const id = getToasts()[0].id
    dismissToast(id)
    // Si el timeout no se hubiera cancelado, esto llamaría dismissToast(id) de nuevo sobre una
    // lista que ya no lo tiene — no debería tirar ni duplicar nada.
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow()
    expect(getToasts()).toHaveLength(0)
  })

  it('sobre un id que no existe no hace nada (no emite, no rompe)', () => {
    showToast('queda')
    expect(() => dismissToast(99999)).not.toThrow()
    expect(getToasts()).toHaveLength(1)
  })
})

describe('auto-dismiss por tono', () => {
  it('un error dura 6000ms', () => {
    showToast('error', 'error')
    vi.advanceTimersByTime(5999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('un ok dura 4000ms', () => {
    showToast('listo', 'ok')
    vi.advanceTimersByTime(3999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })
})

describe('subscribeToasts', () => {
  it('notifica a los suscriptores cuando cambia la lista', () => {
    const onChange = vi.fn()
    subscribeToasts(onChange)
    showToast('algo')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('el unsubscribe corta las notificaciones futuras', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToasts(onChange)
    unsubscribe()
    showToast('algo')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('getToasts — estabilidad de referencia', () => {
  // Requisito de useSyncExternalStore: si nada cambió, tiene que devolver la MISMA referencia,
  // si no React entra en loop de re-render.
  it('devuelve la misma referencia si no hubo ningún cambio en el medio', () => {
    showToast('algo')
    const a = getToasts()
    const b = getToasts()
    expect(a).toBe(b)
  })

  it('devuelve una referencia nueva sólo cuando la lista realmente cambia', () => {
    const before = getToasts()
    showToast('algo')
    const after = getToasts()
    expect(after).not.toBe(before)
  })
})


describe('avisos con detalle y acción', () => {
  it('guarda el detalle y la acción tal como llegan', () => {
    const onClick = vi.fn()
    showToast('No se pudo archivar', 'error', { detail: 'Revisá la conexión.', action: { label: 'Reintentar', onClick } })
    const [toast] = getToasts()
    expect(toast.detail).toBe('Revisá la conexión.')
    expect(toast.action?.label).toBe('Reintentar')
    toast.action?.onClick()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('un aviso con botón no se apaga solo', () => {
    // Si se fuera a los 6s, el `Reintentar` desaparecería justo cuando alguien lo busca.
    showToast('No se pudo archivar', 'error', { action: { label: 'Reintentar', onClick: () => {} } })
    vi.advanceTimersByTime(60_000)
    expect(getToasts()).toHaveLength(1)
  })

  it('el mismo título con otro detalle NO se deduplica', () => {
    // Bug a evitar: al pasar a título + detalle, "Saldo reajustado" de dos cuentas distintas
    // colapsaba en un solo aviso y el segundo se perdía.
    showToast('Saldo reajustado', 'ok', { detail: 'Efectivo queda en $ 100,00' })
    showToast('Saldo reajustado', 'ok', { detail: 'ICBC queda en $ 200,00' })
    expect(getToasts()).toHaveLength(2)
  })

  it('el mismo título y detalle sí se deduplica', () => {
    showToast('Saldo reajustado', 'ok', { detail: 'Efectivo queda en $ 100,00' })
    showToast('Saldo reajustado', 'ok', { detail: 'Efectivo queda en $ 100,00' })
    expect(getToasts()).toHaveLength(1)
  })
})
