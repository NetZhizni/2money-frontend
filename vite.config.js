import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar(),
    components({
      dirs: ['src/components'],
      directoryAsNamespace: true,
      collapseSamePrefixes: true,
      dts: 'src/components.d.ts',
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
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    allowedHosts: ['fin2.leleka.pp.ua'],
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `js/[name]-${new Date().getTime()}.js`,
        chunkFileNames: `chunk/[hash]-${new Date().getTime()}.js`,
        assetFileNames: `assets/[hash]-${new Date().getTime()}[extname]`,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/assets/index.scss";`,
      },
    },
  },
})
