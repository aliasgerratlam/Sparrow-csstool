/* Generates the extension's square PNG icons from the brand wordmark
   (src/assets/sparrow-logo.png): the bird mark alone, centred on a rounded
   Sparrow-blue gradient tile — the same look the hand-made 48px icon had,
   but rendered from the 1361×576 source so every size is pixel-sharp.

   Chrome/Brave resolve an icon with ExtensionIconSet::Match::kBigger: if the
   manifest declares no icon at least as large as the size the surface wants,
   they fall back to the default puzzle-piece glyph rather than upscaling. The
   install bubble and chrome://extensions ask for 128, so we must SHIP 128 (and
   the intermediate sizes the toolbar uses at fractional DPI).

   Pure Node (zlib + manual PNG/CRC), no deps.
   Run: node extension/scripts/gen-icons.mjs */
import { deflateSync, inflateSync } from 'node:zlib'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(root, 'src', 'assets', 'sparrow-logo.png')
const OUT = path.join(root, 'extension', 'icons')
const SIZES = [16, 32, 48, 128]

// Tile gradient, sampled off the original 48px icon: a 135° ramp running from
// near-white at the bottom-left corner to Sparrow blue at the top-right.
const GRAD_FROM = [237, 247, 255]
const GRAD_TO = [44, 157, 254]
const RADIUS_RATIO = 6 / 48 // rounded-corner radius as a fraction of the tile
const MARK_RATIO = 0.7 // bird height as a fraction of the tile
const SS = 4 // supersampling factor for the corner mask

mkdirSync(OUT, { recursive: true })

/* ---------------------------------------------------------------- PNG codec */

const crcTable = (() => {
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
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Minimal decoder: 8-bit RGBA, non-interlaced (what the brand PNG is). */
function decodePng(buf) {
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0) {
    throw new Error('gen-icons: expected an 8-bit RGBA, non-interlaced PNG source')
  }
  const idat = []
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = y * (stride + 1) + 1
    for (let i = 0; i < stride; i++) {
      const x = raw[line + i]
      const a = i >= 4 ? out[y * stride + i - 4] : 0 // left
      const b = y > 0 ? out[(y - 1) * stride + i] : 0 // up
      const c = y > 0 && i >= 4 ? out[(y - 1) * stride + i - 4] : 0 // up-left
      let v
      switch (filter) {
        case 0: v = x; break
        case 1: v = x + a; break
        case 2: v = x + b; break
        case 3: v = x + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error(`gen-icons: unknown PNG filter ${filter}`)
      }
      out[y * stride + i] = v & 0xff
    }
  }
  return { width, height, data: out }
}

/* ------------------------------------------------- isolate the bird mark */

/* The wordmark is "bird + Sparrow" on transparency. Label the opaque pixels
   into connected components and keep the ones left of the "S" — the bird is
   three strokes (body/head, upper wing, tail) and every letter starts well to
   its right, so a single x cut separates them without hard-coding a crop. */
function extractMark(img) {
  const { width: W, height: H, data } = img
  const LETTERS_START_X = 520
  const on = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) on[i] = data[(i << 2) + 3] > 8 ? 1 : 0

  const keep = new Uint8Array(W * H)
  const seen = new Uint8Array(W * H)
  for (let start = 0; start < W * H; start++) {
    if (!on[start] || seen[start]) continue
    const stack = [start]
    const pixels = []
    seen[start] = 1
    let minX = W
    while (stack.length) {
      const q = stack.pop()
      const x = q % W
      const y = (q / W) | 0
      pixels.push(q)
      if (x < minX) minX = x
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const ni = ny * W + nx
        if (on[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni) }
      }
    }
    if (minX < LETTERS_START_X) for (const q of pixels) keep[q] = 1
  }

  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!keep[y * W + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const crop = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y + y0) * W + (x + x0)) << 2
      const dst = (y * w + x) << 2
      if (!keep[(y + y0) * W + (x + x0)]) continue
      crop[dst] = data[src]
      crop[dst + 1] = data[src + 1]
      crop[dst + 2] = data[src + 2]
      crop[dst + 3] = data[src + 3]
    }
  }
  return { width: w, height: h, data: crop }
}

/* --------------------------------------------------------------- resampling */

/** Area-average (box) resample in premultiplied alpha, so transparent pixels
 *  can't bleed their colour into the mark's antialiased edge. */
function resample(img, dw, dh) {
  const { width: sw, height: sh, data } = img
  const out = Buffer.alloc(dw * dh * 4)
  const xr = sw / dw
  const yr = sh / dh
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * yr
    const sy1 = sy0 + yr
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * xr
      const sx1 = sx0 + xr
      let r = 0, g = 0, b = 0, a = 0, wsum = 0
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0)
        if (wy <= 0) continue
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0)
          if (wx <= 0) continue
          const w = wx * wy
          const i = (y * sw + x) << 2
          const al = data[i + 3] / 255
          r += data[i] * al * w
          g += data[i + 1] * al * w
          b += data[i + 2] * al * w
          a += al * w
          wsum += w
        }
      }
      const o = (dy * dw + dx) << 2
      if (a > 0) {
        out[o] = Math.round(Math.min(255, r / a))
        out[o + 1] = Math.round(Math.min(255, g / a))
        out[o + 2] = Math.round(Math.min(255, b / a))
        out[o + 3] = Math.round(Math.min(255, (a / wsum) * 255))
      }
    }
  }
  return { width: dw, height: dh, data: out }
}

/* ------------------------------------------------------------- tile render */

/** Antialiased rounded-square coverage in [0,1] for pixel (x,y). */
function coverage(x, y, size, radius) {
  let hits = 0
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS
      const py = y + (sy + 0.5) / SS
      const cx = Math.min(px, size - px)
      const cy = Math.min(py, size - py)
      if (cx >= radius || cy >= radius) { hits++; continue }
      const dx = radius - cx
      const dy = radius - cy
      if (dx * dx + dy * dy <= radius * radius) hits++
    }
  }
  return hits / (SS * SS)
}

function makeIcon(mark, size) {
  const radius = size * RADIUS_RATIO
  const markH = Math.round(size * MARK_RATIO)
  const markW = Math.max(1, Math.round((markH * mark.width) / mark.height))
  const scaled = resample(mark, markW, markH)
  const offX = Math.round((size - markW) / 2)
  const offY = Math.round((size - markH) / 2)

  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tileA = coverage(x, y, size, radius)
      // 135° ramp: bottom-left (t=0) → top-right (t=1).
      const t = (x + (size - 1 - y)) / (2 * (size - 1))
      let r = GRAD_FROM[0] + (GRAD_TO[0] - GRAD_FROM[0]) * t
      let g = GRAD_FROM[1] + (GRAD_TO[1] - GRAD_FROM[1]) * t
      let b = GRAD_FROM[2] + (GRAD_TO[2] - GRAD_FROM[2]) * t
      let a = tileA

      const mx = x - offX
      const my = y - offY
      if (mx >= 0 && my >= 0 && mx < markW && my < markH) {
        const mi = (my * markW + mx) << 2
        const ma = (scaled.data[mi + 3] / 255) * tileA // clipped by the tile
        if (ma > 0) {
          // Source-over of the mark onto the tile, both premultiplied.
          const outA = ma + a * (1 - ma)
          r = (scaled.data[mi] * ma + r * a * (1 - ma)) / outA
          g = (scaled.data[mi + 1] * ma + g * a * (1 - ma)) / outA
          b = (scaled.data[mi + 2] * ma + b * a * (1 - ma)) / outA
          a = outA
        }
      }

      const o = (y * size + x) << 2
      out[o] = Math.round(r)
      out[o + 1] = Math.round(g)
      out[o + 2] = Math.round(b)
      out[o + 3] = Math.round(a * 255)
    }
  }
  return encodePng(size, size, out)
}

const mark = extractMark(decodePng(readFileSync(SRC)))
console.log(`bird mark: ${mark.width}×${mark.height} from ${path.relative(root, SRC)}`)
for (const size of SIZES) {
  writeFileSync(path.join(OUT, `icon${size}.png`), makeIcon(mark, size))
  console.log(`wrote extension/icons/icon${size}.png`)
}
