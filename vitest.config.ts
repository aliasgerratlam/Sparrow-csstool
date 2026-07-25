import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Minimal Vitest setup (the first test infra in the repo). Node environment is
// enough: the units under test are pure helpers that take the current origin as
// a parameter, so no DOM/jsdom is required. Mirrors the `@/` → `src/` alias.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
