import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en las variables de entorno.')
}

/**
 * El error que GoTrue deja en el fragment cuando un link de mail no sirve —vencido, ya usado o
 * adulterado— antes de que supabase-js lo consuma.
 *
 * El snapshot va acá, al tope del módulo y ANTES de `createClient`, a propósito: con
 * `detectSessionInUrl` (el default) supabase-js parsea y LIMPIA la URL durante la inicialización
 * del cliente, que arranca al importar este archivo. Leerlo desde un `useEffect` de la página sería
 * una carrera que se pierde casi siempre.
 */
const hashParams = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.slice(1))

export const authUrlError = hashParams.get('error')
  ? { code: hashParams.get('error_code'), description: hashParams.get('error_description') }
  : null

export const supabase = createClient<Database>(url, anonKey)
