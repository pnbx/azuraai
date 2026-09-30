#!/usr/bin/env node
/**
 * Brand asset generator — builds every icon/splash variant from the master
 * AZURA logo using sharp. Also extracts dominant brand colors to
 * public/brand/brand-colors.json for the CSS theme.
 *
 * Usage: node scripts/brand.mjs
 */
import sharp from 'sharp'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO = path.join(ROOT, 'public/brand/azura-logo-system.png')
const OUT = {
  brand: path.join(ROOT, 'public/brand'),
  icons: path.join(ROOT, 'public/brand/icons'),
  android: path.join(ROOT, 'android/app/src/main/res'),
  favicon: path.join(ROOT, 'app'),
}

const ANDROID_DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const ADAPTIVE_DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
const SPLASH_DENSITIES = { mdpi: 480, hdpi: 800, xhdpi: 960, xxhdpi: 1280, xxxhdpi: 1920 }

const BG = '#0b0b12' // deep-space background behind the mark

async function exists(p) {
  try { await fs.access(p); return true } catch { return false }
}

async function writeIfChanged(file, buf) {
  const payload = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8')
  const old = (await exists(file)) ? await fs.readFile(file) : null
  if (old && old.equals(payload)) return false
  await fs.writeFile(file, payload)
  return true
}

/** Extract dominant brand colors (quantized, classified by lightness). */
async function extractColors() {
  const { data, info } = await sharp(LOGO)
    .resize(48, 48, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const counts = new Map()
  for (let i = 0; i < data.length; i += channels) {
    // quantize to /8 buckets to merge near-duplicates
    const r = data[i] & 0xf8
    const g = data[i + 1] & 0xf8
    const b = data[i + 2] & 0xf8
    const key = (r << 16) | (g << 8) | b
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const hex = (v) =>
    '#' + [16, 8, 0].map((s) => ((v >> s) & 0xff).toString(16).padStart(2, '0')).join('')

  const out = { primary: null, dark: null, light: null, palette: [] }
  for (const [key, count] of sorted.slice(0, 40)) {
    const r = (key >> 16) & 0xff
    const g = (key >> 8) & 0xff
    const b = key & 0xff
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const entry = { hex: hex(key), count, lum: Math.round(lum) }
    out.palette.push(entry)
    if (!out.primary && lum >= 60 && lum <= 200) out.primary = entry.hex
    if (!out.dark && lum < 60) out.dark = entry.hex
    if (!out.light && lum > 200) out.light = entry.hex
  }
  return out
}

/** Square PNG: logo centered on a solid background. */
async function renderSquare(size, { bg = BG, logoRatio = 0.72 } = {}) {
  const logoBuf = await sharp(LOGO)
    .resize(Math.round(size * logoRatio), Math.round(size * logoRatio), { fit: 'inside' })
    .png()
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logoBuf, blend: 'over' }])
    .png()
    .toBuffer()
}

/** Adaptive-icon foreground: transparent canvas, logo inside the safe zone. */
async function renderAdaptiveForeground(size) {
  const logoBuf = await sharp(LOGO)
    .resize(Math.round(size * 0.55), Math.round(size * 0.55), { fit: 'inside' })
    .png()
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logoBuf, blend: 'over' }])
    .png()
    .toBuffer()
}

async function main() {
  if (!(await exists(LOGO))) {
    console.error(`Master logo not found: ${LOGO}`)
    console.error('Copy "AZURA AI logo system.png" from Downloads into public/brand/')
    process.exit(1)
  }
  const meta = await sharp(LOGO).metadata()
  console.log(`Master logo: ${meta.width}x${meta.height} ${meta.format}`)

  // 1. Brand colors → JSON consumed by the CSS theme
  const colors = await extractColors()
  await fs.writeFile(
    path.join(OUT.brand, 'brand-colors.json'),
    JSON.stringify(colors, null, 2)
  )
  console.log('Brand colors:', colors.primary, colors.dark, colors.light)

  // 2. Web/PWA icons
  await fs.mkdir(OUT.icons, { recursive: true })
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-1024.png', 1024],
    ['apple-touch-icon.png', 180],
  ]) {
    const buf = await renderSquare(size, { logoRatio: 0.78 })
    const wrote = await writeIfChanged(path.join(OUT.icons, name), buf)
    console.log(`${wrote ? '✓' : '·'} public/brand/icons/${name}`)
  }

  // 3. Favicons
  await writeIfChanged(path.join(OUT.favicon, 'favicon.png'), await renderSquare(32, { logoRatio: 0.85 }))
  await writeIfChanged(path.join(OUT.favicon, 'favicon-48.png'), await renderSquare(48, { logoRatio: 0.85 }))
  console.log('✓ app/favicon.png + favicon-48.png')

  // 4. Android legacy launcher icons
  for (const [density, size] of Object.entries(ANDROID_DENSITIES)) {
    const dir = path.join(OUT.android, `mipmap-${density}`)
    await fs.mkdir(dir, { recursive: true })
    const buf = await renderSquare(size, { logoRatio: 0.75 })
    await writeIfChanged(path.join(dir, 'ic_launcher.png'), buf)
    await writeIfChanged(path.join(dir, 'ic_launcher_round.png'), buf)
    console.log(`✓ mipmap-${density}/ic_launcher{,_round}.png (${size}px)`)
  }

  // 5. Adaptive icon foregrounds (background color comes from values/)
  for (const [density, size] of Object.entries(ADAPTIVE_DENSITIES)) {
    const dir = path.join(OUT.android, `mipmap-${density}`)
    await fs.mkdir(dir, { recursive: true })
    const buf = await renderAdaptiveForeground(size)
    await writeIfChanged(path.join(dir, 'ic_launcher_foreground.png'), buf)
    console.log(`✓ mipmap-${density}/ic_launcher_foreground.png (${size}px)`)
  }

  // Adaptive background color resource
  const bgColor = colors.dark ?? '#0b0b13'
  const valuesDir = path.join(OUT.android, 'values')
  await fs.mkdir(valuesDir, { recursive: true })
  await writeIfChanged(
    path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">${bgColor}</color>\n</resources>\n`
  )
  console.log(`✓ values/ic_launcher_background.xml (${bgColor})`)

  // 6. Splash screens
  for (const [density, size] of Object.entries(SPLASH_DENSITIES)) {
    const dir = path.join(OUT.android, `drawable-${density}`)
    await fs.mkdir(dir, { recursive: true })
    const buf = await renderSquare(size, { logoRatio: 0.3 })
    await writeIfChanged(path.join(dir, 'splash.png'), buf)
    console.log(`✓ drawable-${density}/splash.png (${size}px)`)
  }

  console.log('\nDone — brand assets are up to date.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
