/**
 * Espejo en hex de los tokens de theme.css para usar en Recharts. Los `tick`/`stroke` de Recharts
 * terminan como atributos SVG y no siempre resuelven `var(--...)` de forma confiable entre
 * navegadores — mejor no arriesgar y mantener estos valores sincronizados a mano.
 *
 * Sincronizarlos a mano significa que se pueden desincronizar a mano: ya pasó una vez con
 * `chalkFaint`, que quedó en el `#676D78` viejo cuando el token subió a `#7A818C` justamente para
 * pasar AA — y los ticks de los tres gráficos se quedaron en 3.6:1 sin que nada lo avisara. Por eso
 * `chartColors.test.ts` compara cada entrada de acá contra su token en theme.css: si tocás un color
 * en el theme y no acá, ahora falla el CI.
 */
export const chartColors = {
  acid: '#C8F751',
  coral: '#FF7A66',
  chalkFaint: '#7A818C',
  chalkDim: '#A0A6AE',
  inkGrid: '#191C24',
  inkTooltip: '#191C24',
  inkTooltipRing: '#22262F',
}
