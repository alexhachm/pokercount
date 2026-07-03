// Generates PWA PNG icons and iOS splash screens (no external deps) using Node's zlib.
// Draws a felt-green rounded tile with a white spade — recognizable blackjack mark.
// iOS renders transparent icon pixels as solid black and ignores the manifest
// background_color for the launch screen, so the apple-touch-icon, the maskable
// icon, and all apple-touch-startup-image splashes are emitted fully opaque.
// Output: public/pwa-192x192.png, public/pwa-512x512.png, public/pwa-maskable-512x512.png,
//         public/apple-touch-icon.png, public/splash/apple-splash-<WxH>.png
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

function encodePNG(raw, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
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

// fullBleed: opaque square with no transparent rounded corners (required for
// apple-touch-icon and maskable icons — iOS/launchers apply their own mask).
// ring: draw the inner FELT_LIGHT border (off for maskable, whose edges may be cropped).
// spadeFrac: spade size as a fraction of the icon (smaller for maskable safe zone).
function renderPNG(size, { fullBleed = false, ring = true, spadeFrac = 0.3 } = {}) {
  // RGBA raw with filter byte (0) per scanline
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  const r = size * 0.16 // corner radius
  const cx = size / 2
  const cy = size / 2
  const spadeScale = size * spadeFrac
  const spadeCy = size * 0.46
  for (let y = 0; y < size; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type none
    for (let x = 0; x < size; x++) {
      let col = FELT
      let a = 255

      // rounded-rect mask (transparent outside, unless full-bleed)
      const inside = fullBleed || roundedRectInside(x + 0.5, y + 0.5, size, size, r)
      if (!inside) {
        a = 0
        col = FELT
      } else {
        // inner border ring
        const m = size * 0.09
        const onBorder =
          ring &&
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

  return encodePNG(raw, size, size)
}

// Opaque launch screen: solid felt background with a centered white spade.
// iOS shows apple-touch-startup-image on cold launch; without it the splash
// is plain white — jarring for a dark app.
function renderSplash(width, height) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  const cx = width / 2
  const cy = height * 0.47
  const spadeScale = Math.min(width, height) * 0.14
  // Only run the spade test near the mark; everything else is flat felt.
  const bound = spadeScale * 1.8
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type none
    for (let x = 0; x < width; x++) {
      let col = FELT
      if (Math.abs(x + 0.5 - cx) < bound && Math.abs(y + 0.5 - cy) < bound) {
        const u = (x + 0.5 - cx) / spadeScale
        const v = (cy - (y + 0.5)) / spadeScale
        if (inSpade(u, v)) col = WHITE
      }
      const off = rowStart + 1 + x * 4
      raw[off] = col[0]
      raw[off + 1] = col[1]
      raw[off + 2] = col[2]
      raw[off + 3] = 255
    }
  }
  return encodePNG(raw, width, height)
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
  [192, 'pwa-192x192.png', {}],
  [512, 'pwa-512x512.png', {}],
  // iOS renders transparency as black; maskable launchers crop the edges.
  [180, 'apple-touch-icon.png', { fullBleed: true }],
  [512, 'pwa-maskable-512x512.png', { fullBleed: true, ring: false, spadeFrac: 0.24 }],
]
for (const [size, name, opts] of sizes) {
  const png = renderPNG(size, opts)
  writeFileSync(join(outDir, name), png)
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`)
}

// apple-touch-startup-image needs one exactly-sized PNG per device class,
// matched in index.html via device-width/device-height/pixel-ratio media queries.
// [pixelW, pixelH] portrait; covers SE through 16 Pro Max.
const splashSizes = [
  [750, 1334], // SE 2/3, 8 (@2x 375x667)
  [828, 1792], // XR, 11 (@2x 414x896)
  [1125, 2436], // X/XS, 11 Pro, 12/13 mini (@3x 375x812)
  [1170, 2532], // 12/13/14 (@3x 390x844)
  [1179, 2556], // 14 Pro, 15, 16 (@3x 393x852)
  [1206, 2622], // 16 Pro (@3x 402x874)
  [1242, 2208], // 6+/7+/8+ (@3x 414x736)
  [1242, 2688], // XS Max, 11 Pro Max (@3x 414x896)
  [1284, 2778], // 12/13 Pro Max, 14 Plus (@3x 428x926)
  [1290, 2796], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus (@3x 430x932)
  [1320, 2868], // 16 Pro Max (@3x 440x956)
]
const splashDir = join(outDir, 'splash')
mkdirSync(splashDir, { recursive: true })
for (const [w, h] of splashSizes) {
  const name = `apple-splash-${w}x${h}.png`
  const png = renderSplash(w, h)
  writeFileSync(join(splashDir, name), png)
  console.log(`wrote splash/${name} (${w}x${h}, ${png.length} bytes)`)
}
void GOLD
