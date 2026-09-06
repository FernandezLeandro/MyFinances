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
 */
export const CATEGORY_COLORS = [
  { hex: '#1D8F7E', name: 'teal' },
  { hex: '#2F6FB8', name: 'sky' },
  { hex: '#C4402A', name: 'rose' },
  { hex: '#B8862A', name: 'amber' },
  { hex: '#6A5BB8', name: 'violet' },
  { hex: '#A6874A', name: 'sand' },
  { hex: '#6B8F2A', name: 'moss' },
  { hex: '#C2622E', name: 'coral' },
] as const
