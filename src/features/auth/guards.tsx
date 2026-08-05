import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'

/** Protege /hoy, /movimientos, /fijos, /analisis: sin sesión, no hay nada que ver. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return null // Bloque 5: acá va un skeleton de carga inicial.
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />

  return children
}

/** Para login/registro/recuperar: si ya hay sesión, no tiene sentido mostrar el formulario. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return null
  if (session) return <Navigate to="/hoy" replace />

  return children
}
