import { createPersistedFlag } from '@/lib/persistedFlag'

const usePersistedSidebarFlag = createPersistedFlag('sidebar')

/** Estado "sidebar colapsado a sólo íconos", persistido y compartido entre AppLayout y AdminLayout. */
export function useSidebarCollapsed(): [boolean, () => void] {
  return usePersistedSidebarFlag('collapsed')
}
