import { useTheme } from '@/lib/useTheme'

/**
 * Espejo en hex de los tokens de theme.css para usar en Recharts. Los `tick`/`stroke` de Recharts
 * terminan como atributos SVG y no siempre resuelven `var(--...)` de forma confiable entre
 * navegadores — mejor no arriesgar y mantener estos valores sincronizados a mano.
 *
 * Con el tema conmutable (claro/oscuro) esto ya no puede ser una constante fija: hay un juego de
 * colores por tema, y `useChartColors()` devuelve el que corresponde al tema activo en runtime.
 *
 * Sincronizarlos a mano significa que se pueden desincronizar a mano — por eso `chartColors.test.ts`
 * compara cada entrada de acá contra su bloque de `:root`/`:root[data-theme="dark"]` en theme.css:
 * si tocás un color del theme y no acá, ahora falla el CI.
 */
export interface ChartColorSet {
  accent: string
  negative: string
  fgMuted: string
  fgSecondary: string
  grid: string
  tooltipBg: string
  tooltipRing: string
}

const light: ChartColorSet = {
  accent: '#2B3FD6',
  negative: '#C4402A',
  fgMuted: '#82848C',
  fgSecondary: '#63656D',
  grid: '#EAE8E0',
  tooltipBg: '#FBFAF6',
  tooltipRing: '#E2E0D7',
}

const dark: ChartColorSet = {
  accent: '#4F5EEB',
  negative: '#FF8F75',
  fgMuted: '#8B8D96',
  fgSecondary: '#A5A7B0',
  grid: '#24262E',
  tooltipBg: '#191B21',
  tooltipRing: '#23252C',
}

export const chartColors = { light, dark }

/** Los 6 colores de categoría de los gráficos (donut, comparación), uno por tema. */
export const chartCategoryColors = {
  light: ['#1D8F7E', '#C4402A', '#2F6FB8', '#6A5BB8', '#B8862A', '#6B8F2A'],
  dark: ['#4FC9B3', '#FF8F75', '#6FB4F0', '#A08FF0', '#E8B45F', '#A8D94F'],
} as const

/** El set de colores para el tema activo — usar en vez de `chartColors.light`/`.dark` a mano en
 *  cualquier componente que dibuje un gráfico. */
export function useChartColors(): ChartColorSet {
  const [isDark] = useTheme()
  return isDark ? dark : light
}
