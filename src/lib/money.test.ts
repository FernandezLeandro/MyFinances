import { describe, expect, it } from 'vitest'
import {
  centsFromNumeric,
  centsToNumeric,
  formatCompact,
  formatMoney,
  formatQuantity,
  parseAmountToCents,
  parseQuantity,
  splitMoney,
  unitsFromNumeric,
  unitsToNumeric,
} from './money'

// Los espacios que separan el símbolo del número en `Intl.NumberFormat('es-AR', ...)` son
// no-breaking (U+00A0), no un espacio común — normalizamos antes de comparar para no acoplar la
// suite a qué glifo exacto usa la versión de ICU de turno.
const normSpaces = (s: string) => s.replace(/[   ]/g, ' ')

describe('humo de ICU', () => {
  // Si esto falla, Node está corriendo con `small-icu` en vez de full-ICU: todos los tests de
  // formatters de acá abajo van a fallar con mensajes crípticos. Este los adelanta con uno claro.
  it('resuelve el locale es-AR completo', () => {
    expect(new Intl.NumberFormat('es-AR').resolvedOptions().locale).toBe('es-AR')
  })
})

describe('centsFromNumeric', () => {
  it('convierte un numeric de PostgREST a centavos enteros', () => {
    expect(centsFromNumeric('1234.56')).toBe(123456)
  })

  it('no arrastra el error clásico de floats (0.1 + 0.2)', () => {
    expect(centsFromNumeric('0.07')).toBe(7)
    expect(centsFromNumeric('0.30')).toBe(30)
  })

  it('redondea si el numeric trae más precisión de la esperada', () => {
    expect(centsFromNumeric('10.005')).toBe(1001) // Math.round(1000.5) = 1001
  })
})

describe('centsToNumeric', () => {
  it('convierte centavos a un numeric(12,2) con 2 decimales fijos', () => {
    expect(centsToNumeric(123456)).toBe('1234.56')
    expect(centsToNumeric(0)).toBe('0.00')
    expect(centsToNumeric(7)).toBe('0.07')
  })

  it('hace round-trip con centsFromNumeric', () => {
    for (const value of ['0.00', '1234.56', '-99.99', '10000.01']) {
      expect(centsToNumeric(centsFromNumeric(value))).toBe(value)
    }
  })
})

describe('parseAmountToCents', () => {
  it('interpreta el formato es-AR: punto de miles, coma de decimales', () => {
    expect(parseAmountToCents('1.234,50')).toBe(123450)
  })

  it('tolera el formato inglés cuando no hay coma', () => {
    expect(parseAmountToCents('1234.5')).toBe(123450)
  })

  it('trata un punto seguido de 3 dígitos como separador de miles', () => {
    expect(parseAmountToCents('1.234')).toBe(123400)
  })

  it('NO trata un punto seguido de menos de 3 dígitos como separador de miles', () => {
    expect(parseAmountToCents('1.23')).toBe(123)
  })

  it('ignora el símbolo de moneda y espacios', () => {
    expect(parseAmountToCents('$ 1.234,50')).toBe(123450)
  })

  it('devuelve null para vacío o sólo espacios', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
  })

  it('soporta negativos', () => {
    expect(parseAmountToCents('-500')).toBe(-50000)
  })

  it('devuelve null para texto sin ningún dígito, no 0', () => {
    // Bug real encontrado al escribir este test: `'abc'.replace(/[^\d.-]/g, '')` da `''`, y
    // `Number('') === 0` es finito → sin el guard explícito esto devolvía `0`, un importe
    // "válido" que se podía guardar. Ver el fix en parseAmountToCents.
    expect(parseAmountToCents('abc')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formatea con símbolo, agrupación de miles y 2 decimales', () => {
    expect(normSpaces(formatMoney(1248050))).toBe('$ 12.480,50')
  })

  it('agrega + cuando signed y el importe es positivo', () => {
    expect(normSpaces(formatMoney(1000, { signed: true }))).toBe('+$ 10,00')
  })

  it('no antepone + a un importe negativo, aunque sea signed', () => {
    expect(normSpaces(formatMoney(-1000, { signed: true }))).toContain('-$ 10,00')
  })

  it('acepta USD como moneda alternativa', () => {
    expect(normSpaces(formatMoney(123450, { currency: 'USD' }))).toContain('1.234,50')
  })
})

describe('formatCompact', () => {
  // No pasa por Intl — es aritmética de strings a mano, se puede testear el resultado exacto.
  it('sin sufijo por debajo de mil', () => {
    expect(formatCompact(99900)).toBe('999')
  })

  it('sufijo k entre mil y un millón', () => {
    expect(formatCompact(1234500)).toBe('12k')
  })

  it('sufijo M por encima de un millón, con coma decimal', () => {
    expect(formatCompact(150000000)).toBe('1,5M')
  })

  it('conserva el signo negativo', () => {
    expect(formatCompact(-50000)).toBe('-500')
  })
})

describe('splitMoney', () => {
  it('separa signo, símbolo, parte entera y decimales', () => {
    expect(splitMoney(1248050)).toEqual({ sign: '', symbol: '$', whole: '12.480', fraction: '50' })
  })

  it('usa el menos tipográfico (U+2212), no un guion, para negativos', () => {
    expect(splitMoney(-1248050).sign).toBe('−')
  })

  it('respeta el símbolo de USD', () => {
    expect(splitMoney(100, 'USD').symbol).toBe('US$')
  })
})

describe('unitsFromNumeric / unitsToNumeric — escala genérica por activo', () => {
  it('con decimals=2 se comporta igual que centsFromNumeric/centsToNumeric', () => {
    expect(unitsFromNumeric('1234.56', 2)).toBe(centsFromNumeric('1234.56'))
    expect(unitsToNumeric(123456, 2)).toBe(centsToNumeric(123456))
  })

  it('soporta 8 decimales, estilo satoshi', () => {
    expect(unitsFromNumeric('0.00000001', 8)).toBe(1)
    expect(unitsToNumeric(1, 8)).toBe('0.00000001')
  })

  it('hace round-trip con 8 decimales para una cantidad típica de cripto', () => {
    expect(unitsToNumeric(unitsFromNumeric('0.015', 8), 8)).toBe('0.01500000')
  })
})

describe('formatQuantity', () => {
  it('no arrastra ceros de más', () => {
    expect(formatQuantity(1500000, 8)).toBe('0,015')
  })

  it('con decimals=2 se comporta como un importe de dinero sin símbolo', () => {
    expect(formatQuantity(123456, 2)).toBe('1.234,56')
  })
})

describe('parseQuantity', () => {
  it('interpreta el mismo formato es-AR que parseAmountToCents, en la escala del activo', () => {
    expect(parseQuantity('0,015', 8)).toBe(1500000)
  })

  it('devuelve null para vacío', () => {
    expect(parseQuantity('', 8)).toBeNull()
  })

  it('devuelve null para texto sin dígitos, no 0 — mismo bug que parseAmountToCents', () => {
    expect(parseQuantity('abc', 8)).toBeNull()
  })
})
