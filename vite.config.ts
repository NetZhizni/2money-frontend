import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new SW installs and waits — we decide
      // when to activate it, so the user can be asked first (see
      // src/pwa/updateService.ts + UpdateToast.vue) instead of the app
      // silently swapping code under them mid-session.
      registerType: 'prompt',
      // Without this, `npm run dev` never registers a service worker at all
      // (only a production build does), so Chrome/Android never consider the
      // app installable and it can only ever open as a normal browser tab —
      // this is what "standalone" actually depends on, not the manifest alone.
      devOptions: { enabled: true, type: 'module' },
      // Precache the built app shell so the app still opens with no network
      // at all. The DATA layer offline story is now our own (src/db/sync.ts +
      // Dexie, see src/db/schema.ts) — this only needs to cover static assets.
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '2Money',
        short_name: '2Money',
        description: 'Застосунок для ведення сімейних фінансів',
        lang: 'uk',
        theme_color: '#2a78d6',
        background_color: '#f0f0f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // SPA fallback: any non-precached navigation still resolves to the
        // shell so client-side routing keeps working offline.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // The @mdi/js icon vendor chunk (full icon set, for the searchable
        // icon picker) is a large but well-compressing ~2.9MB — raise the
        // precache limit so it isn't silently skipped from offline caching.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8099,
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
    allowedHosts: ['fin2.leleka.pp.ua'],
  },
  preview: {
    port: 8099,
    allowedHosts: ['fin2.leleka.pp.ua'],
  },
  build: {
    // The @mdi/js icon set is imported in full (for the searchable icon picker),
    // which produces one intentionally large, well-compressing vendor chunk.
    chunkSizeWarningLimit: 3200,
    rollupOptions: {
      output: {
        entryFileNames: `js/[name]-${Date.now()}.js`,
        chunkFileNames: `chunk/[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[hash]-${Date.now()}[extname]`,
      },
    },
  },
})
