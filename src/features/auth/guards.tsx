import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/profile/api'

/**
 * Protege /hoy, /movimientos, /fijos, /analisis, /patrimonio, /ajustes: hace falta sesión Y perfil.
 * Sin perfil, la cuenta nunca redimió una invitación (alta interrumpida, o un `signUp()` llamado
 * directo sin pasar por el formulario) — no hay nada propio que mostrar todavía.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const profile = useProfile()

  if (loading) return null // Bloque 5: acá va un skeleton de carga inicial.
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (profile.isPending) return null
  if (profile.data === null) return <Navigate to="/bienvenida" replace />

  return children
}

/** Para login/registro/recuperar: si ya hay sesión, no tiene sentido mostrar el formulario — a
 *  dónde mandarla depende de si ya completó el alta o le falta el paso de `/bienvenida`. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const profile = useProfile()

  if (loading) return null
  if (session && profile.isPending) return null
  if (session && profile.data) return <Navigate to="/hoy" replace />
  if (session && profile.data === null) return <Navigate to="/bienvenida" replace />

  return children
}

/** Para /bienvenida: hace falta sesión, pero todavía SIN perfil — si ya lo tiene, no hay nada que completar. */
export function RequireSessionNoProfile({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const profile = useProfile()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (profile.isPending) return null
  if (profile.data) return <Navigate to="/hoy" replace />

  return children
}
