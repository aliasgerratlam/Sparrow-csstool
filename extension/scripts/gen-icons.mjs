/* Generates the extension's square PNG icons (16/48/128) — a rounded Sparrow-blue
   tile with a lighter inset square, so we don't have to ship the wide wordmark
   scaled into a distorted little box. Pure Node (zlib + manual PNG/CRC), no deps.
   Run: node extension/scripts/gen-icons.mjs */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons')
mkdirSync(OUT, { recursive: true })

const BLUE = [0x10, 0x66, 0xf1] // --color-sparrow-blue #1066f1
const LIGHT = [0x9d, 0xc6, 0xff] // lighter inset

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
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  const inset = Math.round(size * 0.22)
  const radius = size * 0.22
  // Build RGBA scanlines (each row prefixed by a filter byte 0).
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      // Rounded-corner alpha mask.
      const cx = Math.min(x, size - 1 - x)
      const cy = Math.min(y, size - 1 - y)
      let alpha = 255
      if (cx < radius && cy < radius) {
        const dx = radius - cx
        const dy = radius - cy
        if (dx * dx + dy * dy > radius * radius) alpha = 0
      }
      const inField =
        x >= inset && x < size - inset && y >= inset && y < size - inset
      const [r, g, b] = inField ? LIGHT : BLUE
      const off = y * (stride + 1) + 1 + x * 4
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
      raw[off + 3] = alpha
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [16, 48, 128]) {
  writeFileSync(path.join(OUT, `icon${size}.png`), makePng(size))
  console.log(`wrote icons/icon${size}.png`)
}
