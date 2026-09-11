/// <reference types="node" />
// El resto de `src/` compila bajo `tsconfig.app.json`, cuyo `types` es sólo `["vite/client"]` a
// propósito — no queremos que el código de browser vea globals de Node por accidente. Este test sí
// corre en Node (vitest) y necesita `fs`/`url` para leer `theme.css` del disco; la referencia de
// arriba le da los tipos SÓLO acá, sin tocar el resto del proyecto.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { chartCategoryColors, chartColors } from './chartColors'

type ChartColorSet = (typeof chartColors)['light']

// Lee los tokens de color directo de theme.css, en vez de importarlo — es un archivo CSS, no un
// módulo. Esto es lo que evita que `chartColors` (el espejo en hex que necesita Recharts, ver el
// comentario de ese archivo) vuelva a quedar desincronizado del theme sin que nada lo note: si
// alguien cambia un `--c-*` acá y se olvida del espejo, este test falla.
const themePath = fileURLToPath(new URL('../styles/theme.css', import.meta.url))
const themeSource = readFileSync(themePath, 'utf-8')

// El bloque claro vive en `:root { ... }` y el oscuro en `:root[data-theme='dark'] { ... }` — se
// recorta cada uno por separado así un token con el mismo nombre en los dos bloques (todos, acá)
// no hace que el regex del claro matchee por accidente el valor del oscuro.
function themeBlock(theme: 'light' | 'dark'): string {
  const marker = theme === 'light' ? ':root {' : ":root[data-theme='dark'] {"
  const start = themeSource.indexOf(marker)
  if (start === -1) throw new Error(`No se encontró el bloque ${marker} en theme.css`)
  const end = themeSource.indexOf('\n}', start)
  return themeSource.slice(start, end)
}

function themeToken(theme: 'light' | 'dark', name: string): string {
  const match = themeBlock(theme).match(new RegExp(`--c-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`No se encontró --c-${name} en el bloque ${theme} de theme.css`)
  return match[1].toLowerCase()
}

// Qué entrada de ChartColorSet corresponde a qué token crudo (--c-*) del theme.
const expectedTokens: Record<keyof (typeof chartColors)['light'], string> = {
  accent: 'accent',
  negative: 'negative',
  fgMuted: 'fg-muted',
  fgSecondary: 'fg-secondary',
  grid: 'divider',
  tooltipBg: 'surface',
  tooltipRing: 'border',
}

describe('chartColors', () => {
  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      it.each(Object.entries(expectedTokens))('%s coincide con --c-%s en theme.css', (key, tokenName) => {
        const actual = chartColors[theme][key as keyof ChartColorSet].toLowerCase()
        expect(actual).toBe(themeToken(theme, tokenName))
      })
    })
  }
})

describe('chartCategoryColors', () => {
  for (const theme of ['light', 'dark'] as const) {
    it.each(chartCategoryColors[theme].map((hex, i) => [i + 1, hex] as const))(
      `cat-%s coincide con --c-cat-%s en theme.css (${theme})`,
      (index, hex) => {
        expect(hex.toLowerCase()).toBe(themeToken(theme, `cat-${index}`))
      },
    )
  }
})
