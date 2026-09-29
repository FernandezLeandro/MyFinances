/**
 * Paleta cerrada de categorías: 8 familias × 4 tonos (vivos, pastel, medios, profundos) más 8
 * neutros, en el orden en que los muestra el editor (una fila por tono). La base la limita a estos
 * mismos 40 (`categories_color_palette`, `20260926010001_categorias_icono_y_paleta.sql`) — si se
 * suma uno acá, hay que sumarlo también ahí.
 *
 * Incluye los 14 de la paleta anterior (filas «medios» y «profundos», salvo Marino y Vino), así
 * ninguna categoría guardada cambió de color. Los que venían de la identidad anterior se llevaron
 * al más parecido de éstos en esa migración.
 *
 * Deliberadamente sin el azul tinta del acento: ese color queda reservado para el saldo y los CTA.
 */
export const CATEGORY_PALETTE = [
  [
    { hex: '#E53935', name: 'Rojo' },
    { hex: '#FB8C00', name: 'Naranja' },
    { hex: '#FDD835', name: 'Amarillo' },
    { hex: '#7CB342', name: 'Lima' },
    { hex: '#00ACC1', name: 'Cian' },
    { hex: '#1E88E5', name: 'Azul' },
    { hex: '#8E24AA', name: 'Púrpura' },
    { hex: '#D81B60', name: 'Fucsia' },
  ],
  [
    { hex: '#FF9A9A', name: 'Salmón' },
    { hex: '#FFC48A', name: 'Durazno' },
    { hex: '#FFE58A', name: 'Crema' },
    { hex: '#C5E1A5', name: 'Menta' },
    { hex: '#9FE3EA', name: 'Agua' },
    { hex: '#9EC9F5', name: 'Celeste' },
    { hex: '#D1A8F0', name: 'Lavanda' },
    { hex: '#F7A8C8', name: 'Rosa' },
  ],
  [
    { hex: '#C4402A', name: 'Teja' },
    { hex: '#C2622E', name: 'Coral' },
    { hex: '#B8862A', name: 'Ámbar' },
    { hex: '#3B8A38', name: 'Helecho' },
    { hex: '#1D8F7E', name: 'Turquesa' },
    { hex: '#2F6FB8', name: 'Azul cielo' },
    { hex: '#6A5BB8', name: 'Violeta' },
    { hex: '#9B3B78', name: 'Frambuesa' },
  ],
  [
    { hex: '#B23449', name: 'Carmín' },
    { hex: '#A6874A', name: 'Arena' },
    { hex: '#6B8F2A', name: 'Musgo' },
    { hex: '#307E59', name: 'Jade' },
    { hex: '#2C8396', name: 'Petróleo' },
    { hex: '#1F3A93', name: 'Marino' },
    { hex: '#8949A2', name: 'Ciruela' },
    { hex: '#7A1F3D', name: 'Vino' },
  ],
  [
    { hex: '#000000', name: 'Negro' },
    { hex: '#3A3A3F', name: 'Grafito' },
    { hex: '#6B6B72', name: 'Gris' },
    { hex: '#A0A0A8', name: 'Plata' },
    { hex: '#D0D0D5', name: 'Niebla' },
    { hex: '#8A9BAE', name: 'Pizarra' },
    { hex: '#8D6E63', name: 'Café' },
    { hex: '#5D4037', name: 'Chocolate' },
  ],
] as const

export const CATEGORY_COLORS = CATEGORY_PALETTE.flat()

export type CategoryColorHex = (typeof CATEGORY_COLORS)[number]['hex']

export const CATEGORY_COLOR_HEXES = CATEGORY_COLORS.map((c) => c.hex) as [CategoryColorHex, ...CategoryColorHex[]]

const INK = '#16171b'

/** Luminancia relativa WCAG de un `#rrggbb`. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Color del ícono sobre una ficha sólida de `hex`: blanco o tinta, el que más contraste. Fijo, no
 *  depende del tema — la ficha tiene el mismo fondo en claro y en oscuro. `0.0585` es la luminancia
 *  de la tinta (`#16171b`) más 0.05. */
export function onColor(hex: string): '#ffffff' | typeof INK {
  const l = luminance(hex)
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0585 ? '#ffffff' : INK
}
