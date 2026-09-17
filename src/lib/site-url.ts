/**
 * El dominio con el que se arman los links que Supabase manda por mail (recuperar contraseña, y
 * confirmación de cuenta si algún día se prende).
 *
 * Por qué no alcanza `window.location.origin` solo: ese valor es el host que el usuario tenía
 * abierto en ese momento — desde un preview de Cloudflare Pages, el link del mail lo devuelve al
 * preview y no a la app real. Con `VITE_SITE_URL` seteada (sólo en el entorno de Production de
 * Cloudflare) el link siempre apunta al dominio canónico; sin ella, el fallback al origin deja el
 * dev local andando sin configurar nada.
 *
 * OJO: esto decide qué `redirect_to` PIDE la app, no cuál acepta Supabase. Si el origen no está en
 * la allow-list del proyecto (Authentication → URL Configuration), GoTrue lo descarta en silencio y
 * usa el Site URL del proyecto — ver `docs/supabase-auth.md`.
 */

/** La resolución en sí, pura: sin `import.meta.env` ni `window`, para poder testearla. */
export function resolveSiteUrl(configured: string | undefined, origin: string, path: string): string {
  const base = (configured?.trim() || origin).replace(/\/+$/, '')
  return `${base}${path}`
}

/** `path` arranca con `/` — p. ej. `siteUrl('/restablecer')`. */
export function siteUrl(path: string): string {
  return resolveSiteUrl(import.meta.env.VITE_SITE_URL, window.location.origin, path)
}
