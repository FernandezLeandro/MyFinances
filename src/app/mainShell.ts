/**
 * Clase del `<main>` compartida entre `AppLayout` y `AdminLayout` — antes era el mismo string
 * copiado literal en los dos archivos, comentarios incluidos. `pt-top`/`px-screen` resuelven el
 * gutter de pantalla y el padding superior desde los tokens de `theme.css` (que ya escalan solos
 * por viewport, ver ahí las `@media`), así que acá no quedan prefijos `sm:`/`md:` para eso.
 *
 * `pb-28` no es un gutter — es el colchón fijo para que el contenido no quede tapado por la isla
 * flotante de `MobileTabBar` (`bottom-[22px]` + 60px de alto), así que no escala con el viewport.
 */
export const MAIN_SHELL_CLASS =
  'min-h-dvh px-screen pt-top pb-28 md:min-h-[calc(100dvh-58px)] md:pb-16'
