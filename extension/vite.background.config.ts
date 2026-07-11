import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

/* Build config for the MV3 background service worker. Bundled as a single
   self-contained IIFE (classic worker script) so there are no cross-chunk
   imports to resolve at runtime — the worker pulls in @clerk/chrome-extension's
   background client (for sign-out) inline. Emits into the shared extension/dist/
   with emptyOutDir:false, so it runs after the content build. */
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  // The extension shares the WEB APP's Clerk instance (Sync Host reads its
  // session), so it uses the same VITE_CLERK_PUBLISHABLE_KEY — not a separate
  // extension key. VITE_EXT_SYNC_HOST is the origin whose Clerk cookies to sync
  // (dev: http://localhost); VITE_EXT_WEB_APP_URL is the page opened for sign-in.
  const clerkKey = env.VITE_CLERK_PUBLISHABLE_KEY || ''
  const syncHost = env.VITE_EXT_SYNC_HOST || 'http://localhost'
  const webAppUrl = env.VITE_EXT_WEB_APP_URL || 'http://localhost:5173'

  return {
    root: repoRoot,
    configFile: false,
    publicDir: false,
    resolve: {
      alias: {
        '@': path.resolve(repoRoot, 'src'),
      },
    },
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(clerkKey),
      'import.meta.env.VITE_EXT_SYNC_HOST': JSON.stringify(syncHost),
      'import.meta.env.VITE_EXT_WEB_APP_URL': JSON.stringify(webAppUrl),
      'process.env.NODE_ENV': '"production"',
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, 'src/background.ts'),
        formats: ['iife'],
        name: 'SparowwBackground',
        fileName: () => 'background.js',
      },
    },
  }
})
