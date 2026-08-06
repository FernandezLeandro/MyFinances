/**
 * Espejo en hex de los tokens de theme.css para usar en Recharts. Los `tick`/`stroke` de Recharts
 * terminan como atributos SVG y no siempre resuelven `var(--...)` de forma confiable entre
 * navegadores — mejor no arriesgar y mantener estos valores sincronizados a mano.
 */
export const chartColors = {
  acid: '#C8F751',
  coral: '#FF7A66',
  chalkFaint: '#676D78',
  chalkDim: '#A0A6AE',
  inkGrid: '#191C24',
  inkTooltip: '#191C24',
  inkTooltipRing: '#22262F',
}
