/* Web-app build guard. The auth gates (Annotate/Share) only engage when
   VITE_CLERK_PUBLISHABLE_KEY is present at build time — without it the whole app
   ships in guest mode and anyone can annotate/share. That regressed silently on
   the live site once, so fail `npm run build` loudly when the key is missing.

   We resolve env exactly the way Vite will (loadEnv reads .env / .env.local /
   .env.<mode> plus process.env), so this check can't disagree with the build.

   Scope: this runs ONLY for the web-app build (npm run build). The extension
   build (npm run build:ext) has its own handling (the content bundle compiles
   the key out; the background bundle shares the web app's key via Sync Host),
   so it never runs this. */
import { loadEnv } from 'vite'

const mode = process.env.NODE_ENV || 'production'
const env = loadEnv(mode, process.cwd(), '')

const missing = []
if (!env.VITE_CLERK_PUBLISHABLE_KEY) missing.push('VITE_CLERK_PUBLISHABLE_KEY')

if (missing.length) {
  console.error(
    `\n[31m✗ Web build blocked:[0m missing required env var(s): ${missing.join(', ')}\n\n` +
      `  Without VITE_CLERK_PUBLISHABLE_KEY the app builds in guest mode and the\n` +
      `  Annotate/Share auth gates are disabled — anyone can use them.\n\n` +
      `  Set it in your hosting platform's build environment (or .env.local for a\n` +
      `  local production build). See .env.example.\n`,
  )
  process.exit(1)
}
