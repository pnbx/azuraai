// Turns the supplied brand logo JPG into every asset the app needs.
//
// The source is a black mark on a light background in a lossy JPEG, so the
// background has to be removed rather than cropped. We derive an alpha channel
// from luminance (black mark -> opaque, light background -> transparent),
// then re-tint the mark for each context: dark-on-light, light-on-dark, and
// Android's adaptive-icon foreground.
//
// Output:
//   public/brand/*.png                 - web app + favicon/PWA icons
//   android/.../res/mipmap-*/*.png     - launcher icons (legacy + adaptive)
//   android/.../res/drawable/*.png      - splash artwork
//   android/.../res/values/ic_launcher_background.xml - adaptive icon background colour
//
// Run: node scripts/build-logo-assets.js

const fs = require('fs')
const path = require('path')
const sharp = require(path.join(__dirname, '..', 'marketing-site', 'node_modules', 'sharp'))

const ROOT = path.join(__dirname, '..')
const SOURCE = 'C:/Users/ghadiri/Downloads/AZURA AI logo system.jpg'

/** Brand palette — matches the app's zinc theme. */
const INK = { r: 9, g: 9, b: 11 } // #09090b zinc-950
const PAPER = { r: 250, g: 250, b: 250 } // #fafafa zinc-50

/**
 * Builds an RGBA buffer where alpha = darkness, coloured with `tint`.
 * Luminance threshold keeps anti-aliased edges smooth instead of jagged.
 */
async function mask(tint, { threshold = 0.62, softness = 0.3 } = {}) {
  const { data, info } = await sharp(SOURCE)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0; i < info.width * info.height; i++) {
    const lum = data[i] / 255 // 1 = white background, 0 = black mark
    // Map luminance through the threshold/softness band into 0..1 alpha.
    let a = (threshold + softness - lum) / (softness * 2)
    a = Math.max(0, Math.min(1, a))
    // Slight gamma so thin strokes don't fade out.
    a = Math.pow(a, 0.85)
    const o = i * 4
    out[o] = tint.r
    out[o + 1] = tint.g
    out[o + 2] = tint.b
    out[o + 3] = Math.round(a * 255)
  }
  return { data: out, width: info.width, height: info.height }
}

/** Upscales the extracted mask; the 282x188 source is small, so sharpen after. */
async function render(tint, size, opts = {}) {
  const { data, width, height } = await mask(tint, opts)
  return sharp(data, { raw: { width, height, channels: 4 } })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .sharpen({ sigma: 0.8 })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Centres the mark inside a square at `fill` of the canvas. */
async function renderInCanvas(tint, canvas, fill, opts = {}) {
  const { data, width, height } = await mask(tint, opts)
  const inner = Math.round(canvas * fill)
  const scaled = await sharp(data, { raw: { width, height, channels: 4 } })
    .resize(inner, inner, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  console.log('  ✓', path.relative(ROOT, file).replace(/\\/g, '/'))
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('missing source logo:', SOURCE)
    process.exit(1)
  }
  console.log('generating brand assets …')

  // ── Web / PWA ────────────────────────────────────────────────────────────
  const brand = path.join(ROOT, 'public', 'brand')
  await write(path.join(brand, 'logo-mark.png'), await render(INK, 512))
  await write(path.join(brand, 'logo-mark-white.png'), await render(PAPER, 512))
  await write(path.join(brand, 'icon-192.png'), await render(INK, 192))
  await write(path.join(brand, 'icon-512.png'), await render(INK, 512))
  await write(path.join(brand, 'icon-512-maskable.png'), await renderInCanvas(INK, 512, 0.62))

  // ── Android launcher icons ───────────────────────────────────────────────
  // Legacy square/round icons (pre-Oreo) get the mark on a zinc plate.
  const densities = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ]
  for (const [dpi, px] of densities) {
    const plate = await sharp({
      create: {
        width: px,
        height: px,
        channels: 4,
        background: { ...INK, alpha: 1 },
      },
    })
      .composite([{ input: await renderInCanvas(PAPER, px, 0.62), gravity: 'centre' }])
      .png()
      .toBuffer()

    const dir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', `mipmap-${dpi}`)
    await write(path.join(dir, 'ic_launcher.png'), plate)
    await write(path.join(dir, 'ic_launcher_round.png'), plate)
    // Adaptive foreground: 108dp canvas, mark inside the 66% safe zone.
    await write(
      path.join(dir, 'ic_launcher_foreground.png'),
      await renderInCanvas(PAPER, Math.round((px * 108) / 48), 0.42)
    )
  }

  // ── Splash artwork ───────────────────────────────────────────────────────
  const splash = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable')
  for (const px of [192, 384, 768]) {
    await write(path.join(splash, `azura_splash_${px}.png`), await render(PAPER, px))
  }

  // ── Adaptive icon background colour ──────────────────────────────────────
  const values = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values')
  await write(
    path.join(values, 'ic_launcher_background.xml'),
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<!-- Generated by scripts/build-logo-assets.js — zinc-950. -->\n' +
        '<resources>\n    <color name="ic_launcher_background">#09090B</color>\n</resources>\n'
    )
  )

  console.log('done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})