import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// `defineConfig` viene de `vitest/config` (no de `vite`) para que el bloque `test` de abajo tipe
// bien — es un re-export que agrega los tipos de Vitest a la misma función, así que todo lo demás
// se comporta exactamente igual que un `vite.config.ts` normal.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Bajo test no hay build ni SW que generar — VitePWA sólo agregaría trabajo (y ruido de
    // workbox) a cada corrida de `vitest`.
    ...(mode === 'test'
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'MyFinances',
              short_name: 'MyFinances',
              description: 'Ingresos, gastos y gastos fijos del mes, con el saldo final que te queda de verdad.',
              theme_color: '#0A0B0E',
              background_color: '#0A0B0E',
              display: 'standalone',
              start_url: '/hoy',
              scope: '/',
              lang: 'es-AR',
              icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // La app habla directo con Supabase — no hay nada de datos para precachear acá, sólo el
              // shell estático (JS/CSS/HTML), así que carga instantánea en visitas repetidas. El
              // navigateFallback por defecto ya sirve index.html para cualquier ruta del SPA (incluida
              // /restablecer, que llega como navegación fresca desde el link del mail).
              globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // react/react-router/supabase salen a su propio chunk con nombre fijo: no es sólo el peso
    // inicial (recharts/motion ya se sacaron del camino eager con React.lazy en App.tsx) — es el
    // cache-hit ENTRE DEPLOYS. Sin esto, cambiar una línea de UI invalida un único chunk de más de
    // 1 MB para todos los usuarios; separado, el navegador sólo vuelve a bajar el pedacito de la
    // app que de verdad cambió, mientras react/supabase siguen cacheados entre versiones.
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        // Sólo react/react-router/supabase van a un bucket con nombre fijo: son necesarios para
        // TODO por igual (eager y lazy), así que agruparlos aparte da cache-hit entre deploys sin
        // ningún riesgo. `recharts` y `motion` quedan deliberadamente SIN asignar acá — forzarlos a
        // un bucket propio sonaba bien en la teoría, pero en la práctica arrastra código de
        // react-dom al mismo chunk (recharts usa Redux/react-redux internamente, y el interop
        // CJS→ESM de esa cadena termina filtrando al bucket forzado), lo que hacía que ese chunk se
        // precargara eager en TODAS las rutas — exactamente lo que este cambio quería evitar. Sin
        // nombre, Rollup arma el chunk según quién los alcanza de verdad: como sólo los importan
        // Analisis/Patrimonio/Categorias (las 3 rutas lazy), quedan afuera del chunk inicial igual,
        // sólo que sin el nombre fijo — cache-hit entre deploys se sacrifica ahí, pero no vale la
        // pena el riesgo de que un cambio de versión futuro de recharts vuelva a filtrar código eager.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          const parts = id.split(/[\\/]/)
          const i = parts.lastIndexOf('node_modules')
          const pkg = parts[i + 1]?.startsWith('@') ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1]
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'react-router' || pkg === 'scheduler') return 'vendor-react'
          if (pkg?.startsWith('@supabase')) return 'vendor-supabase'
          return undefined
        },
      },
    },
  },
  test: {
    // money.ts y aggregate.ts son funciones puras, sin DOM — no hace falta jsdom/happy-dom.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
}))
