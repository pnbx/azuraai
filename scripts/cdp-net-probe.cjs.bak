/**
 * On-device network probe: reload the app, send a chat message, and
 * capture the /api/app/chat SSE response status + body frames.
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
  const events = []
  let chatRequestId = null
  let chatStatus = null
  const consoleLogs = []

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
      return
    }
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url
      if (u.includes('/api/app/')) {
        chatRequestId = m.params.requestId
        events.push(`REQ ${m.params.request.method} ${u}`)
      }
    }
    if (m.method === 'Network.responseReceived' && m.params.requestId === chatRequestId) {
      chatStatus = m.params.response.status
      events.push(`RESP status=${m.params.response.status} mime=${m.params.response.mimeType}`)
    }
    if (m.method === 'Network.loadingFailed' && m.params.requestId === chatRequestId) {
      events.push(`FAILED ${m.params.errorText}`)
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (text && text !== 'Object') consoleLogs.push(`[${m.params.type}] ${text.slice(0, 180)}`)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleLogs.push(`[EXC] ${m.params.exceptionDetails.text?.slice(0, 180)}`)
    }
  }

  await new Promise((r) => (ws.onopen = r))
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Network.enable')
  await call('Page.reload', { ignoreCache: true })
  await new Promise((r) => setTimeout(r, 7000))

  const sendResult = await call('Runtime.evaluate', {
    expression: `(async () => {
      const ta = document.querySelector('textarea')
      if (!ta) return 'NO_COMPOSER'
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      set.call(ta, 'Reply with exactly: PONG')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === 'Send message')
      if (!btn || btn.disabled) return 'SEND_DISABLED'
      btn.click()
      await new Promise(r => setTimeout(r, 20000))
      return JSON.stringify({
        demo: document.body.innerText.includes('Demo mode'),
        tail: [...document.querySelectorAll('p')].map(p => p.textContent).filter(t => t.length > 3).slice(-3),
      })
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  console.log('SEND:', sendResult.result?.result?.value)
  console.log('NET:', events.join(' | ') || 'no /api/app request captured')
  console.log('PAGE_CONSOLE:', consoleLogs.slice(-10).join(' || ') || 'clean')
  ws.close()
  process.exit(0)
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
