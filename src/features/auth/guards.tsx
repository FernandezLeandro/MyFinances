import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'
import { useProfile } from '@/features/profile/api'

/**
 * Protege /hoy, /movimientos, /fijos, /analisis, /patrimonio, /ajustes: hace falta sesión Y perfil.
 * Sin perfil, la cuenta nunca redimió una invitación (alta interrumpida, o un `signUp()` llamado
 * directo sin pasar por el formulario) — no hay nada propio que mostrar todavía. Una cuenta admin
 * tampoco entra acá: no tiene nada que hacer en lo financiero, se la manda a /admin.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const profile = useProfile()

  if (loading) return null // Bloque 5: acá va un skeleton de carga inicial.
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (profile.isPending) return null
  if (profile.data === null) return <Navigate to="/bienvenida" replace />
  if (profile.data?.role === 'admin') return <Navigate to="/admin" replace />

  return children
}

/** Para /admin/*: sesión + perfil + rol admin. Cualquier otra cuenta rebota a /hoy. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const profile = useProfile()

  if (loading) return null
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  if (profile.isPending) return null
  if (profile.data === null) return <Navigate to="/bienvenida" replace />
  if (profile.data?.role !== 'admin') return <Navigate to="/hoy" replace />

  return children
}

/** Para login/registro/recuperar: si ya hay sesión, no tiene sentido mostrar el formulario — a
 *  dónde mandarla depende de si ya completó el alta, y si es admin o cuenta común. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const profile = useProfile()

  if (loading) return null
  if (session && profile.isPending) return null
  if (session && profile.data === null) return <Navigate to="/bienvenida" replace />
  if (session && profile.data?.role === 'admin') return <Navigate to="/admin" replace />
  if (session && profile.data) return <Navigate to="/hoy" replace />

  return children
}

/** Para /bienvenida: hace falta sesión, pero todavía SIN perfil — si ya lo tiene, no hay nada que
 *  completar (se la manda a donde corresponda según su rol). */
export function RequireSessionNoProfile({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const profile = useProfile()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (profile.isPending) return null
  if (profile.data?.role === 'admin') return <Navigate to="/admin" replace />
  if (profile.data) return <Navigate to="/hoy" replace />

  return children
}
