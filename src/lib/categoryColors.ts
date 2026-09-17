/**
 * Paleta para categorías nuevas creadas por el usuario. Deliberadamente sin el azul tinta: ese
 * color queda reservado para el saldo, los CTA y la serie primaria de un gráfico — ofrecerlo acá
 * invitaría a ponerlo en todos lados, y ahí deja de ser acento.
 *
 * Tonos alineados a `chartCategoryColors.light` (`chartColors.ts`) en vez de los pasteles de la
 * identidad anterior, que se elegían para resaltar sobre un fondo casi negro — sobre el papel cálido
 * `#efeee8` quedaban lavados. El color de cada categoría se guarda tal cual en la base
 * (`categories.color`) y no cambia con el tema: éstos son de saturación media a propósito, para
 * seguir siendo legibles tanto en claro como en oscuro.
 *
 * Catorce en vez de los ocho originales — con una cuenta que ya administra muchas categorías (fijos
 * + movimientos + compras en cuotas), ocho tonos obligaban a repetir color entre categorías sin
 * relación. Orden en rueda de color (rojo → naranja → amarillo-verde → verde → cian → azul →
 * violeta → magenta) para que el selector se recorra como un degradé, no una lista al azar; los
 * ocho originales quedan intactos (mismo hex) para no correr el color de ninguna categoría ya
 * guardada — sólo se intercalaron los seis nuevos en el hueco de rueda que les toca.
 */
export const CATEGORY_COLORS = [
  { hex: '#C4402A', name: 'rose' },
  { hex: '#C2622E', name: 'coral' },
  { hex: '#B8862A', name: 'amber' },
  { hex: '#A6874A', name: 'sand' },
  { hex: '#6B8F2A', name: 'moss' },
  { hex: '#3B8A38', name: 'fern' },
  { hex: '#307E59', name: 'jade' },
  { hex: '#1D8F7E', name: 'teal' },
  { hex: '#2C8396', name: 'cyan' },
  { hex: '#2F6FB8', name: 'sky' },
  { hex: '#6A5BB8', name: 'violet' },
  { hex: '#8949A2', name: 'plum' },
  { hex: '#9B3B78', name: 'berry' },
  { hex: '#B23449', name: 'crimson' },
] as const
