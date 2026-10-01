/**
 * Theme verification: reads computed colors from the phone's WebView to
 * confirm the zinc/monochrome theme port rendered (no violet anywhere).
 * Requires adb forward tcp:9222 -> the app's webview_devtools_remote socket.
 */
const http = require('http')

function getPages() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

async function main() {
  const pages = await getPages()
  const page = pages.find((p) => p.url.includes('azuraai.ir'))
  if (!page) return console.log('NO_PAGE')
  console.log('URL:', page.url)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method, params }))
    })

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }

  await new Promise((r) => (ws.onopen = r))

  const probe = `(() => {
    const cs = getComputedStyle(document.body)
    const btn = document.querySelector('button[type=submit]')
    const btnCs = btn ? getComputedStyle(btn) : null
    const input = document.querySelector('input')
    const violets = ['8b6cf5','7c5cf0','b9a5ff','482898','6848d8']
    const html = document.documentElement.innerHTML.toLowerCase()
    const foundViolet = violets.filter(v => html.includes(v))
    return JSON.stringify({
      title: document.title,
      bodyBg: cs.backgroundColor,
      bodyColor: cs.color,
      btnBg: btnCs ? btnCs.backgroundColor : null,
      inputBg: input ? getComputedStyle(input).backgroundColor : null,
      violetResidue: foundViolet,
      hasWordmark: !!document.querySelector('[class*=wordmark], header, form'),
    })
  })()`

  const res = await call('Runtime.evaluate', { expression: probe, returnByValue: true })
  console.log('THEME:', res.result?.result?.value)
  ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.log('ERR:', e.message)
  process.exit(1)
})
