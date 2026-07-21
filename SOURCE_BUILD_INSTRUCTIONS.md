# Build instructions for Mozilla add-on reviewers

This add-on ("Sparrow — CSS Inspector & Annotator") is built from TypeScript/React
source with **Vite** (Rollup + esbuild), which bundles and minifies the output. These
steps reproduce an exact copy of the submitted add-on.

## Build environment

- **Operating system:** any (Windows, macOS, or Linux). The submitted build was produced
  on Windows 10.
- **Node.js:** v24.18.0 (any Node ≥ 20 works; use `npm ci` to pin exact dependencies).
- **npm:** 11.16.0 (ships with the Node version above).
- No global tools required — everything is a project dev-dependency.

## Steps

1. Unzip this source archive and open a terminal in the project root (the folder
   containing `package.json`).

2. Create a file named `.env.local` in the project root with these **public,
   client-side** keys (they are embedded in the shipped extension bundle and are not
   secret). They must match exactly to reproduce the same output:

   ```
   VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsudHJ5c3BhcnJvd2Nzcy5jb20k
   VITE_SUPABASE_URL=https://kxfhtngartcqghtcwwiz.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4Zmh0bmdhcnRjcWdodGN3d2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTAzMzUsImV4cCI6MjA5NzY4NjMzNX0.BA2v1hNyg9kX50a9lOodYByhKCQRCjahXLMuYzwTz9I
   ```

   (`VITE_EXT_SYNC_HOST` and `VITE_EXT_WEB_APP_URL` are optional; when unset they
   default to `https://www.trysparrowcss.com`, which is what the submitted build uses.)

3. Install the exact dependency versions from the lockfile:

   ```
   npm ci
   ```

4. Build and package the extension:

   ```
   npm run package:ext
   ```

   This runs two Vite builds (the content script and the background script) and then
   `extension/scripts/package-ext.mjs`, which writes the per-browser builds.

## Output to compare

- The Firefox build is written to **`extension/build/firefox/`** — this unpacked folder
  (its `manifest.json`, `dist/content.js`, `dist/background.js`, `dist/content.css`,
  `icons/`, `fonts/`) is the exact content of the submitted add-on.
- A zipped copy is also written to `public/sparrow-firefox.zip`.

## Notes

- The build reads only the three public `VITE_*` values above. No server secrets are used
  by, or included in, the extension build.
- Source files are the original `.ts`/`.tsx` under `src/` and `extension/src/`; only the
  third-party libraries in `node_modules` (installed via `npm ci`) are pre-built.
