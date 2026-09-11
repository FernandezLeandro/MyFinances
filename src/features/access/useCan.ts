import { useProfile } from '@/features/profile/api'
import { can } from '@/features/access/plan'
import type { Capability, Plan } from '@/features/access/plan'

/** El plan de la cuenta logueada. `'test'` mientras el perfil todavía no resolvió — el más
 *  restrictivo, así que ningún gate se abre de más durante ese instante de carga. */
export function usePlan(): Plan {
  const { data: profile } = useProfile()
  return profile?.plan ?? 'test'
}

/** `useCan('analisis')` — true/false según el plan de la cuenta logueada. Para las rutas, usar
 *  `RequireCapability` (`src/features/auth/guards.tsx`), que además maneja el estado de carga. */
export function useCan(cap: Capability): boolean {
  const plan = usePlan()
  return can(plan, cap)
}
