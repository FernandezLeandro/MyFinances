import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AuthContext } from '@/features/auth/auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // SIGNED_OUT llega tanto por cualquiera de los botones de "Cerrar sesión" como por un token
      // que ya no se puede refrescar — en los dos casos la caché de la cuenta anterior tiene que
      // morir acá, no quedar en memoria hasta el próximo reload.
      if (event === 'SIGNED_OUT') queryClient.clear()
    })

    return () => listener.subscription.unsubscribe()
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
