/// <reference types="node" />
// El resto de `src/` compila bajo `tsconfig.app.json`, cuyo `types` es sólo `["vite/client"]` a
// propósito — no queremos que el código de browser vea globals de Node por accidente. Este test sí
// corre en Node (vitest) y necesita `fs`/`url` para leer `theme.css` del disco; la referencia de
// arriba le da los tipos SÓLO acá, sin tocar el resto del proyecto.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { chartColors } from './chartColors'

// Lee los tokens de color directo de theme.css, en vez de importarlo — es un archivo CSS, no un
// módulo. Esto es lo que evita que `chartColors` (el espejo en hex que necesita Recharts, ver el
// comentario de ese archivo) vuelva a quedar desincronizado del theme sin que nada lo note: si
// alguien cambia un `--color-*` acá y se olvida del espejo, este test falla.
const themePath = fileURLToPath(new URL('../styles/theme.css', import.meta.url))
const themeSource = readFileSync(themePath, 'utf-8')

function themeToken(name: string): string {
  const match = themeSource.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`No se encontró --color-${name} en theme.css`)
  return match[1].toLowerCase()
}

// Qué entrada de chartColors corresponde a qué token del theme. inkGrid/inkTooltip son el mismo
// token (ink-800) usados con dos nombres distintos según el rol (grilla vs. fondo de tooltip).
const expectedTokens: Record<keyof typeof chartColors, string> = {
  acid: 'acid',
  coral: 'coral',
  chalkFaint: 'chalk-faint',
  chalkDim: 'chalk-dim',
  inkGrid: 'ink-800',
  inkTooltip: 'ink-800',
  inkTooltipRing: 'ink-700',
}

describe('chartColors', () => {
  it.each(Object.entries(expectedTokens))('%s coincide con --color-%s en theme.css', (key, tokenName) => {
    const actual = chartColors[key as keyof typeof chartColors].toLowerCase()
    expect(actual).toBe(themeToken(tokenName))
  })
})
