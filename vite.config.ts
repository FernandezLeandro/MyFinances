import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
