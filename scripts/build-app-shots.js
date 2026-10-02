/**
 * Turn raw device screenshots into web-ready marketing images.
 *
 * `capture-app-shots.js` produces CDP frames that are already cropped to the
 * WebView (1080x2163, no Android chrome). Raw `adb exec-out screencap` frames
 * include the status bar and gesture bar, so pass those in too and this script
 * crops them with AZURA_WEBVIEW_TOP / AZURA_WEBVIEW_BOTTOM.
 *
 * Output: WebP at a phone-frame-friendly width, which is ~5x smaller than the
 * PNG originals (206KB -> ~40KB) and loads instantly on Iranian mobile nets.
 *
 * Usage: node scripts/build-app-shots.js <outDir> <in...>
 */

const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'node_modules', 'sharp'));

const WIDTH = 720;
const QUALITY = 82;

async function main() {
  const [outDir, ...inputs] = process.argv.slice(2);
  if (!outDir || inputs.length === 0) {
    console.error('usage: node scripts/build-app-shots.js <outDir> <in...>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const top = Number(process.env.AZURA_WEBVIEW_TOP || 0);
  const bottom = Number(process.env.AZURA_WEBVIEW_BOTTOM || 0);

  for (const input of inputs) {
    let pipeline = sharp(input);
    const meta = await pipeline.metadata();

    if (top || bottom) {
      const height = meta.height - top - bottom;
      if (height <= 0) throw new Error(`${input}: crop window is empty`);
      pipeline = pipeline.extract({ left: 0, top, width: meta.width, height });
      pipeline = pipeline.withMetadata();
    }

    const base = path.basename(input).replace(/\.[^.]+$/, '');
    const file = path.join(outDir, `${base}.webp`);
    const info = await pipeline
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(file);

    console.log(
      `${base}: ${meta.width}x${meta.height} -> ${info.width}x${info.height} ` +
        `${(fs.statSync(file).size / 1024).toFixed(0)}KB`
    );
  }
}

main().catch((e) => {
  console.error('build-app-shots failed:', e.message);
  process.exit(1);
});