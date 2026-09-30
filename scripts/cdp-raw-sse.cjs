/**
 * Raw SSE probe: calls /api/app/chat from inside the phone's WebView page
 * (so the session cookie applies) and prints the exact stream frames.
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
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()

  function call(method, params = {}) {
    return new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  }

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }

  await new Promise((r) => (ws.onopen = r))
  await call('Runtime.enable')

  const res = await call('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const r = await fetch('/api/app/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
            mode: 'fast',
          }),
        })
        const reader = r.body.getReader()
        const dec = new TextDecoder()
        let raw = ''
        const deadline = Date.now() + 25000
        while (Date.now() < deadline) {
          const { done, value } = await reader.read()
          if (done) break
          raw += dec.decode(value, { stream: true })
          if (raw.length > 2500) break
        }
        try { reader.cancel() } catch {}
        return JSON.stringify({ status: r.status, ct: r.headers.get('content-type'), raw: raw.slice(0, 2200) })
      } catch (e) {
        return 'FETCH_ERR ' + e.message
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  const v = res.result?.result?.value
  try {
    const o = JSON.parse(v)
    console.log('HTTP', o.status, o.ct)
    console.log('RAW FRAMES:\n' + o.raw)
  } catch {
    console.log('OUT:', v)
  }
  ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
