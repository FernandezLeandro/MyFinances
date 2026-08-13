import { createPersistedFlag } from '@/lib/persistedFlag'

/**
 * Preferencia "ocultar saldo" persistida en localStorage, una por pantalla (`key` distinto para
 * saldo actual y Ahorros, así ocultar uno no afecta al otro).
 */
export const useHiddenBalance = createPersistedFlag('hidden-balance')
