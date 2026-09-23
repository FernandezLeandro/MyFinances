import { useProfile } from '@/features/profile/api'
import { can, FALLBACK_PLAN } from '@/features/access/plan'
import type { Capability, Plan } from '@/features/access/plan'

/** El plan de la cuenta logueada. `FALLBACK_PLAN` (Básico, el más restrictivo) mientras el perfil no
 *  está, así ningún gate se abre de más durante ese instante. Si la consulta falla, `RequireAuth` ni
 *  siquiera deja entrar: muestra el error con Reintentar en vez de armar la app con un plan supuesto. */
export function usePlan(): Plan {
  const { data: profile } = useProfile()
  return profile?.plan ?? FALLBACK_PLAN
}

/** `useCan('analisis')` — true/false según el plan de la cuenta logueada. Para las rutas, usar
 *  `RequireCapability` (`src/features/auth/guards.tsx`), que además maneja el estado de carga. */
export function useCan(cap: Capability): boolean {
  const plan = usePlan()
  return can(plan, cap)
}
