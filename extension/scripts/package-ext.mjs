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
import { deflateRawSync } from 'node:zlib'
import path from 'node:path'

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

// Store-submission zips. Web stores (Chrome Web Store, Edge Add-ons) reject the
// `key` field — they assign the published extension its own id — so the store
// build strips it. The load-unpacked ZIP_NAMES keep `key` so the locally-loaded
// id stays stable (matches Clerk allowed_origins; see extension/README.md).
// Firefox's build already carries no `key`, so its store zip == its unpacked zip.
const STORE_ZIP_NAMES = {
  chromium: 'sparrow-chrome-store.zip',
}

/** Per-target manifest transform applied ONLY to the store build, on top of the
 *  normal target transform. */
const STORE_TRANSFORMS = {
  chromium: (m) => {
    delete m.key // Chrome Web Store / Edge reject `key`; the store owns the id
    return m
  },
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

// CRC-32 (IEEE, the ZIP variant) — table computed once at module load.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Fixed DOS timestamp (1980-01-01 00:00) so the committed zips are byte-stable.
const DOS_DATE = 0x0021
const DOS_TIME = 0x0000

/** Zip a build/<target>/ folder into public/<name>, files at the zip root
 *  (manifest.json on top) so "Load unpacked" works straight after extract.
 *
 *  Hand-rolled encoder rather than a streaming lib on purpose: Mozilla's
 *  addons-linter reads each entry from its LOCAL file header, so the archive
 *  MUST carry the real CRC-32 and sizes there — no data-descriptor (bit 3),
 *  no ZIP64 markers. A streamed zip that defers those to a trailing descriptor
 *  makes AMO fail to find manifest.json ("not found at the root of the
 *  extension"), even though the entry is flat at the root. DEFLATE via zlib is
 *  deterministic, so a fixed DOS timestamp keeps the committed bytes stable. */
async function zipFolder(srcDir, outFile) {
  const rels = (await readdir(srcDir, { recursive: true })).sort()
  const fileParts = [] // local header + name + compressed data, in order
  const central = []   // central-directory headers
  let offset = 0       // running offset of the next local header

  for (const rel of rels) {
    const full = path.join(srcDir, rel)
    if (!(await stat(full)).isFile()) continue
    const nameBuf = Buffer.from(rel.split(path.sep).join('/'), 'utf8') // zip paths are forward-slashed
    const data = await readFile(full)
    const crc = crc32(data)
    const compressed = deflateRawSync(data)
    const size = data.length
    const csize = compressed.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4)         // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6)     // flags: UTF-8 names, NO data descriptor
    local.writeUInt16LE(8, 8)          // compression method: DEFLATE
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(csize, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)         // extra field length
    fileParts.push(local, nameBuf, compressed)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)    // central directory header signature
    cd.writeUInt16LE(20, 4)            // version made by
    cd.writeUInt16LE(20, 6)            // version needed to extract
    cd.writeUInt16LE(0x0800, 8)        // flags
    cd.writeUInt16LE(8, 10)            // compression method: DEFLATE
    cd.writeUInt16LE(DOS_TIME, 12)
    cd.writeUInt16LE(DOS_DATE, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(csize, 20)
    cd.writeUInt32LE(size, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)            // extra field length
    cd.writeUInt16LE(0, 32)            // comment length
    cd.writeUInt16LE(0, 34)            // disk number start
    cd.writeUInt16LE(0, 36)            // internal file attributes
    cd.writeUInt32LE(0, 38)            // external file attributes
    cd.writeUInt32LE(offset, 42)       // relative offset of local header
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + compressed.length
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)    // end of central directory signature
  eocd.writeUInt16LE(0, 4)             // number of this disk
  eocd.writeUInt16LE(0, 6)             // disk where central directory starts
  eocd.writeUInt16LE(central.length / 2, 8)  // cd records on this disk (2 buffers per entry)
  eocd.writeUInt16LE(central.length / 2, 10) // total cd records
  eocd.writeUInt32LE(cdBuf.length, 12) // size of central directory
  eocd.writeUInt32LE(offset, 16)       // offset of central directory
  eocd.writeUInt16LE(0, 20)            // comment length

  await writeFile(outFile, Buffer.concat([...fileParts, cdBuf, eocd]))
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

  // Store-submission variant (key stripped) — separate folder so the load-unpacked
  // build keeps its stable id.
  const storeZipName = STORE_ZIP_NAMES[target]
  if (storeZipName) {
    const storeDir = path.join(buildDir, `${target}-store`)
    await mkdir(storeDir, { recursive: true })
    const storeManifest = STORE_TRANSFORMS[target](structuredClone(manifest))
    await writeFile(path.join(storeDir, 'manifest.json'), JSON.stringify(storeManifest, null, 2) + '\n', 'utf8')
    for (const dir of ASSET_DIRS) {
      await cp(path.join(extDir, dir), path.join(storeDir, dir), { recursive: true })
    }
    await zipFolder(storeDir, path.join(publicDir, storeZipName))
    console.log(`packaged ${target} (store): build/${target}-store/ → public/${storeZipName} (no key)`)
  }
}
