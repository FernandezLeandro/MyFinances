import { useEffect } from 'react'
import { createPersistedFlag } from '@/lib/persistedFlag'

// `createPersistedFlag` está pensado para una familia de flags bajo el mismo namespace (una key
// por pantalla, como `useHiddenBalance`) — acá sólo hay un tema para toda la app, así que el hook
// que devuelve queda envuelto en `useTheme()` con la key fija, para no obligar a cada caller a
// pasar un string que siempre es el mismo.
const usePersistedDark = createPersistedFlag('theme')

/**
 * Preferencia de tema (claro/oscuro), persistida en localStorage bajo `theme:dark`.
 *
 * Default `false` (claro): la dirección elegida del handoff es "Bento claro" (3a), con el oscuro
 * (4a) como variante. `index.html` tiene un script inline que lee esta misma key antes del primer
 * paint para evitar el flash de claro→oscuro en una sesión que ya eligió oscuro.
 */
export function useTheme() {
  return usePersistedDark('dark')
}

/**
 * Aplica el tema activo a `<html data-theme>` (lo que `theme.css` usa para resolver los tokens de
 * color), al `<meta name="theme-color">` y al favicon de la pestaña. Se llama una sola vez, desde
 * cada layout (`AppLayout`/`AdminLayout`/`AuthLayout`) — no hace falta un provider de React: el
 * estado ya vive en localStorage vía `useTheme` y cualquier componente puede leerlo/togglearlo
 * directo, sin prop drilling.
 *
 * El favicon (`<link id="favicon">` en `index.html`) sigue este mismo toggle en vez de
 * `prefers-color-scheme`: la pestaña tiene que mostrar el tema que la persona eligió adentro, no el
 * de su sistema operativo. El script inline de `index.html` ya deja el favicon oscuro puesto antes
 * del primer paint si corresponde (mismo storage key) — acá sólo se mantiene sincronizado cuando el
 * toggle cambia en caliente.
 */
export function useSyncThemeToDocument() {
  const [dark] = useTheme()

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'

    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#0f1014' : '#efeee8')

    const favicon = document.getElementById('favicon') as HTMLLinkElement | null
    if (favicon) favicon.href = dark ? '/icon-dark.svg' : '/icon-light.svg'
  }, [dark])
}
