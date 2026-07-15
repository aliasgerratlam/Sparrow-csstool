/*
 * Assembles two self-contained, load-ready extension folders from the shared
 * source in extension/ — one per browser family:
 *
 *   extension/build/chromium/   (Chrome, Edge, Brave, Opera, Vivaldi)
 *   extension/build/firefox/    (Firefox 140+)
 *
 * Why two folders instead of one shared manifest: Chrome MV3 requires
 * `background.service_worker` and rejects the v2-only `background.scripts`
 * key, while Firefox MV3 runs an *event page* and only honours `scripts` (it
 * never runs a service worker). The other cross-browser-only keys warn too —
 * `browser_specific_settings.gecko` is unknown to Chrome, and `key` /
 * `minimum_chrome_version` are unknown to Firefox. Splitting per target lets
 * each manifest carry exactly what its browser understands: zero warnings on
 * both sides.
 *
 * Run AFTER the bundles are built (npm run build:ext writes extension/dist/).
 * `npm run package:ext` chains both. The build/ output is gitignored, but each
 * build/<target>/ folder is also zipped into the web app's public/ so the
 * landing-page install CTAs can serve it as a same-origin download; those zips
 * ARE committed (public/ is not gitignored) and should be regenerated whenever
 * the extension source changes.
 *
 *   node extension/scripts/package-ext.mjs
 */
import { readFile, writeFile, rm, mkdir, cp, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { downloadZip } from 'client-zip'

const extDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const buildDir = path.join(extDir, 'build')
const publicDir = path.resolve(extDir, '..', 'public')
const BACKGROUND_ENTRY = 'dist/background.js'

// The downloadable zip served from the web app for each target. These names
// must match the URLs in src/lib/extension-download.ts.
const ZIP_NAMES = {
  chromium: 'sparrow-chrome.zip',
  firefox: 'sparrow-firefox.zip',
}

// Copied verbatim into each browser folder (paths stay relative to the manifest,
// so web_accessible_resources / content_scripts references keep resolving).
const ASSET_DIRS = ['dist', 'icons', 'fonts']

/** Browser-specific manifest transforms applied to the shared base manifest. */
const TARGETS = {
  chromium: (m) => {
    m.background = { service_worker: BACKGROUND_ENTRY }
    delete m.browser_specific_settings // Firefox-only; Chrome logs it as unknown
    return m
  },
  firefox: (m) => {
    m.background = { scripts: [BACKGROUND_ENTRY] }
    delete m.key // Chrome-only extension-id pin; Firefox logs it as unknown
    delete m.minimum_chrome_version // Chrome-only; Firefox logs it as unknown
    return m
  },
}

/** Zip a build/<target>/ folder into public/<name>, files at the zip root
 *  (manifest.json on top) so "Load unpacked" works straight after extract. A
 *  fixed epoch mtime keeps the bytes reproducible so committed zips don't churn. */
async function zipFolder(srcDir, outFile) {
  const rels = await readdir(srcDir, { recursive: true })
  const entries = []
  for (const rel of rels.sort()) {
    const full = path.join(srcDir, rel)
    if (!(await stat(full)).isFile()) continue
    entries.push({
      name: rel.split(path.sep).join('/'), // zip paths are forward-slashed
      input: await readFile(full),
      lastModified: new Date(0),
    })
  }
  const bytes = new Uint8Array(await downloadZip(entries).arrayBuffer())
  await writeFile(outFile, bytes)
}

const baseManifest = JSON.parse(await readFile(path.join(extDir, 'manifest.json'), 'utf8'))

await rm(buildDir, { recursive: true, force: true })
await mkdir(publicDir, { recursive: true })

for (const [target, transform] of Object.entries(TARGETS)) {
  const outDir = path.join(buildDir, target)
  await mkdir(outDir, { recursive: true })

  // Fresh clone of the base per target so transforms don't leak between them.
  const manifest = transform(structuredClone(baseManifest))
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  for (const dir of ASSET_DIRS) {
    await cp(path.join(extDir, dir), path.join(outDir, dir), { recursive: true })
  }

  const zipName = ZIP_NAMES[target]
  await zipFolder(outDir, path.join(publicDir, zipName))

  console.log(`packaged ${target}: build/${target}/ → public/${zipName} (background: ${Object.keys(manifest.background).join(', ')})`)
}
