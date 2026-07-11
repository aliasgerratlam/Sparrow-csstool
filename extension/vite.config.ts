import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* Build config for the browser-extension content script. It bundles the scanner
   React tree (from ../src) into a single IIFE plus one CSS file, emitted to
   extension/dist/. Run it from the repo root:  npm run build:ext

   `root` is pinned to the repo root so Tailwind v4's automatic content
   detection scans ../src (where all the utility classes live), not just the
   extension folder. */
const repoRoot = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  return {
  root: repoRoot,
  configFile: false,
  // Don't copy the web app's public/ dir into the extension bundle — the scanner
  // inlines the assets it actually uses (assetsInlineLimit below).
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, 'src'),
    },
  },
  // Supabase (collab/share links) is inlined from .env.local so the extension
  // matches the web app; without those vars it falls back to local-only guest
  // mode. Clerk stays compiled out of the content bundle — extension auth flows
  // through the background worker's Sync Host instead.
  define: {
    // Lets shared components (e.g. ModeRail) apply extension-only behavior,
    // like hiding the tool rail entirely until the user signs in.
    'import.meta.env.VITE_IS_EXTENSION': '"1"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': '""',
    // Vite's *library* build (unlike its app build) does not inline
    // `process.env.NODE_ENV`, so React's dev/prod check would hit an undefined
    // `process` in the content script and crash. Pin it to production here.
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    // Inline every referenced asset (e.g. the logo PNG) as a data URI so the
    // bundle never emits URLs that would resolve against the host page instead
    // of the extension.
    assetsInlineLimit: 100_000_000,
    lib: {
      entry: path.resolve(__dirname, 'src/content.tsx'),
      formats: ['iife'],
      name: 'SparowwScanner',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'content.[ext]',
      },
    },
  },
  }
})
