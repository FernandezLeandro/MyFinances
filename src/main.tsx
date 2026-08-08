import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mensajeDeError } from '@/lib/errors'
import { showToast } from '@/lib/toast'
import './index.css'
import App from './App.tsx'

// Escotilla por hook para cuando el mapa genérico de `mensajeDeError` no alcanza:
// `useMutation({ ..., meta: { errorMessage: 'texto específico' } })`.
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { errorMessage?: string }
  }
}

// Único choke point para los ~24 hooks de mutación de la app: nadie tiene que acordarse de poner
// un onError propio — si una mutación falla en cualquier lado, esto la agarra y muestra un toast.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      showToast(mutation.meta?.errorMessage ?? mensajeDeError(error), 'error')
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
