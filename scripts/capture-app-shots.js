/**
 * Capture marketing screenshots of the Azura Android app.
 *
 * The device blocks `adb shell input` (MIUI INJECT_EVENTS), so instead of
 * tapping we drive the Capacitor WebView over the Chrome DevTools Protocol
 * (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`) and
 * grab `Page.captureScreenshot` frames — which also crops out the Android
 * status and navigation bars, so the shots are pure app UI.
 *
 * Usage: node scripts/capture-app-shots.js <outDir>
 * Requires: AZURA_APP_IDLE=1 so the WebView keeps webContentsDebuggingEnabled.
 */

const fs = require('fs');
const path = require('path');

const CDP_HTTP = process.env.AZURA_CDP || 'http://localhost:9222';
const OUT_DIR = process.argv[2] || path.join(__dirname, '..', 'marketing-site', 'public', 'images', 'app');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  const res = await fetch(`${CDP_HTTP}/json`);
  const list = await res.json();
  const page = list.find((t) => t.type === 'page' && /azura/i.test(t.url));
  if (!page) throw new Error(`no Azura page in ${CDP_HTTP}/json`);
  return page;
}

/** Minimal CDP client over the Node 22 built-in WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}, timeoutMs = 20000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });
  }

  /** Evaluate in the page and return the JSON value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expression);
    return r.result.value;
  }
}

/** Click the first element whose visible text matches `re`. */
const CLICK_BY_TEXT = `((re) => {
  const rx = new RegExp(re, 'i');
  const nodes = [...document.querySelectorAll('button, a, [role=button], div[class*=cursor-pointer]')];
  const el = nodes.find((n) => {
    const t = (n.innerText || '').trim();
    return t && t.length < 120 && rx.test(t);
  });
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return true;
})`;

async function shoot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, 60000);
  const file = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('saved', file, `${(Buffer.from(data, 'base64').length / 1024) | 0}KB`);
}

/** Real tap at an element's centre. Touch alone misses some pointer-driven
 *  drawers, so send a mouse press/release pair as well. */
async function tapSelector(cdp, selector, index = 0) {
  const box = await cdp.eval(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els[${index}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  if (!box) return false;
  const touch = { x: box.x, y: box.y, radiusX: 8, radiusY: 8, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return true;
}

/** Feed a real file from the device into a hidden <input type=file>, which is
 *  how the attach button adds images. Note: the app reads attachments through
 *  Capacitor's Filesystem, so injecting the input alone is not enough — kept
 *  for reference while wiring up a real vision screenshot. */
async function attachDeviceFile(cdp, devicePath) {
  const doc = await cdp.send('DOM.getDocument', { depth: -1 });
  const node = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' });
  if (!node.nodeId) return false;
  await cdp.send('DOM.setFileInputFiles', { files: [devicePath], nodeId: node.nodeId });
  await sleep(2500);
  return true;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // AZURA_SHOT_MODE=welcome reloads first so the empty state is genuinely empty;
  // the default flow assumes a fresh app launch.
  const mode = process.env.AZURA_SHOT_MODE || 'all';
  const page = await target();
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  console.log('url:', await cdp.eval('location.href'));

  if (mode === 'welcome' || mode === 'all') {
    // The app restores the last conversation from localStorage, so wipe it to
    // get a genuinely empty welcome state for the hero shot.
    await cdp.eval('localStorage.clear(); sessionStorage.clear(); true');
    await cdp.send('Page.reload', { ignoreCache: true }, 60000);
    await sleep(12000);
    await shoot(cdp, '01-welcome');
  }
  if (mode === 'welcome') return;

  // 2 — a real conversation with a rendered answer
  console.log('click prompt:', await cdp.eval(`${CLICK_BY_TEXT}('quantum|کوانتوم')`));
  await sleep(15000);
  // Frame the shot from the top of the thread so the question bubble and the
  // start of the answer are both visible.
  console.log('scrolled:', await cdp.eval(`(() => {
    const scroller = [...document.querySelectorAll('*')].find((e) => e.scrollHeight - e.clientHeight > 200 && e.clientHeight > 300);
    if (scroller) { scroller.scrollTop = 0; return true; }
    window.scrollTo(0, 0);
    return false;
  })()`));
  await sleep(1500);
  await shoot(cdp, '02-conversation');

  // 3 — conversation drawer (needs a real tap, not a synthetic click)
  if (mode === 'all') {
    console.log('open menu:', await tapSelector(cdp, 'header button, [data-slot=sidebar-trigger], button'));
    await sleep(2000);
    await shoot(cdp, '03-drawer');
  }

  console.log('done');
  process.exit(0);
}

main().catch((e) => {
  console.error('capture failed:', e.message);
  process.exit(1);
});