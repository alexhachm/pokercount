// Generates PWA PNG icons (no external deps) using Node's zlib.
// Draws a felt-green rounded tile with a white spade — recognizable blackjack mark.
// Output: public/pwa-192x192.png, public/pwa-512x512.png, public/apple-touch-icon.png
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
mkdirSync(outDir, { recursive: true })

// --- CRC32 -----------------------------------------------------------------
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

// --- color helpers ---------------------------------------------------------
const FELT = [10, 61, 36]
const FELT_LIGHT = [11, 110, 59]
const WHITE = [244, 244, 244]
const GOLD = [225, 177, 44]

// Spade membership in normalized coords (origin center, y up positive, unit ~ half-size)
function inSpade(u, v) {
  // heart pointing up -> flip to make point at top, lobes at bottom
  const X = u
  const Y = -v // invert
  const h = Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y
  if (h <= 0) return true
  // stem (trapezoid below the lobes)
  if (v < -0.55 && v > -1.5) {
    const w = 0.06 + (-0.55 - v) * 0.6
    if (Math.abs(u) <= w) return true
  }
  return false
}

function renderPNG(size) {
  // RGBA raw with filter byte (0) per scanline
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  const r = size * 0.16 // corner radius
  const cx = size / 2
  const cy = size / 2
  const spadeScale = size * 0.30
  const spadeCy = size * 0.46
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type none
    for (let x = 0; x < size; x++) {
      let col = FELT
      let a = 255

      // rounded-rect mask (transparent outside)
      const inside = roundedRectInside(x + 0.5, y + 0.5, size, size, r)
      if (!inside) {
        a = 0
        col = FELT
      } else {
        // inner border ring
        const m = size * 0.09
        const onBorder =
          roundedRectInside(x + 0.5, y + 0.5, size, size, r) &&
          !roundedRectInsideInset(x + 0.5, y + 0.5, size, size, r, m) &&
          roundedRectInsideInset(x + 0.5, y + 0.5, size, size, r, m - Math.max(2, size * 0.018))
        if (onBorder) col = FELT_LIGHT

        // spade
        const u = (x + 0.5 - cx) / spadeScale
        const v = (cy - (y + 0.5) - (cy - spadeCy)) / spadeScale
        if (inSpade(u, v)) col = WHITE
      }

      const off = rowStart + 1 + x * 4
      raw[off] = col[0]
      raw[off + 1] = col[1]
      raw[off + 2] = col[2]
      raw[off + 3] = a
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function roundedRectInside(x, y, w, h, r) {
  const minX = 0,
    minY = 0,
    maxX = w,
    maxY = h
  if (x < minX || x > maxX || y < minY || y > maxY) return false
  // corners
  const cxs = [minX + r, maxX - r]
  const cys = [minY + r, maxY - r]
  if (x < cxs[0] && y < cys[0]) return dist(x, y, cxs[0], cys[0]) <= r
  if (x > cxs[1] && y < cys[0]) return dist(x, y, cxs[1], cys[0]) <= r
  if (x < cxs[0] && y > cys[1]) return dist(x, y, cxs[0], cys[1]) <= r
  if (x > cxs[1] && y > cys[1]) return dist(x, y, cxs[1], cys[1]) <= r
  return true
}
function roundedRectInsideInset(x, y, w, h, r, m) {
  return roundedRectInside(x - m, y - m, w - 2 * m, h - 2 * m, Math.max(1, r - m))
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

const sizes = [
  [192, 'pwa-192x192.png'],
  [512, 'pwa-512x512.png'],
  [180, 'apple-touch-icon.png'],
]
for (const [size, name] of sizes) {
  const png = renderPNG(size)
  writeFileSync(join(outDir, name), png)
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`)
}
void GOLD
