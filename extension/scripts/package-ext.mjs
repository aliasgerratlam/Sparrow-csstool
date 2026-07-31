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
 * `npm run package:ext` chains both.
 *
 * Two kinds of output, don't mix them up:
 *   - build/<target>/     gitignored, for "Load unpacked" during development.
 *                         build/chromium/ keeps `key` so the locally-loaded id
 *                         stays stable (matches Clerk allowed_origins).
 *   - public/<zip>        ONE zip per target, the artifact you upload to that
 *                         browser's web store. Committed (public/ is not
 *                         gitignored) and must be regenerated + committed
 *                         whenever the extension source changes, or the version
 *                         served from the site lags behind your working tree.
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

// The single store-submission zip per target. Exactly one per browser on
// purpose: a second "load unpacked" zip alongside it only invites uploading the
// wrong file. Development installs the build/<target>/ folder directly, so no
// zip is needed for that.
const ZIP_NAMES = {
  chromium: 'sparrow-chrome.zip',
  firefox: 'sparrow-firefox.zip',
}

/** Per-target manifest transform applied to the zipped (store) copy only, on
 *  top of the normal target transform. Targets absent here are zipped straight
 *  from build/<target>/ — Firefox needs no changes, since its build already
 *  carries no `key`. */
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

  // The zip is cut from a separate folder when the target needs store-only
  // manifest edits, so build/<target>/ stays exactly what you Load unpacked.
  const storeTransform = STORE_TRANSFORMS[target]
  let zipSrcDir = outDir
  if (storeTransform) {
    zipSrcDir = path.join(buildDir, `${target}-store`)
    await mkdir(zipSrcDir, { recursive: true })
    const storeManifest = storeTransform(structuredClone(manifest))
    await writeFile(path.join(zipSrcDir, 'manifest.json'), JSON.stringify(storeManifest, null, 2) + '\n', 'utf8')
    for (const dir of ASSET_DIRS) {
      await cp(path.join(extDir, dir), path.join(zipSrcDir, dir), { recursive: true })
    }
  }

  const zipName = ZIP_NAMES[target]
  await zipFolder(zipSrcDir, path.join(publicDir, zipName))

  const from = path.relative(extDir, zipSrcDir).split(path.sep).join('/')
  console.log(
    `packaged ${target}: build/${target}/ (load unpacked) · ${from}/ → public/${zipName} (store)` +
      ` [background: ${Object.keys(manifest.background).join(', ')}]`,
  )
}
