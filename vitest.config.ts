import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: the PWA plugin and the Vue SFC
// pipeline have nothing to do with unit tests of plain TS modules (the sync
// layer), and would only slow every run down.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
