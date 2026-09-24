import { describe, expect, it } from 'vitest'
import { pendingBeforeCents } from './projectedBalance'

// FI-08 del QA de Fijos: en 1–15 oct, "Saldo actual $1.476.889 − Fijos por pagar $955.500" da
// $521.389, pero el número grande (proyectado) era $244.389 — $277.000 de diferencia que no
// aparecía en ninguna línea (lo impago del período actual, ya restado por la base).
describe('pendingBeforeCents', () => {
  it('FI-08: período futuro con algo impago de antes — la diferencia exacta que faltaba explicar', () => {
    expect(pendingBeforeCents(1_476_889_00, 955_500_00, 0, 244_389_00)).toBe(277_000_00)
  })

  it('período actual: el desglose ya cierra solo, sin diferencia', () => {
    // El caso normal: proyectado = saldo actual − fijos − deudas, exacto.
    expect(pendingBeforeCents(1_000_00, 400_00, 100_00, 500_00)).toBe(0)
  })

  it('nunca negativo: si el desglose explica MÁS que el proyectado (no debería pasar, pero no hay que restar de más)', () => {
    expect(pendingBeforeCents(1_000_00, 400_00, 0, 700_00)).toBe(0)
  })

  it('proyectado todavía cargando (`undefined`) → 0, no NaN', () => {
    expect(pendingBeforeCents(1_000_00, 400_00, 0, undefined)).toBe(0)
  })

  it('con deudas impagas además de fijos, suma las dos a lo explicado', () => {
    expect(pendingBeforeCents(2_000_00, 500_00, 300_00, 900_00)).toBe(300_00)
  })
})
