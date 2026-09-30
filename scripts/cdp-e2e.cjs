/**
 * On-device E2E: drive the Azura app's WebView over the Chrome DevTools
 * Protocol — inspect the chat UI, send a real message, watch the stream.
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
  if (!page) {
    console.log('NO_PAGE', JSON.stringify(pages.map((p) => p.url)))
    return
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const consoleLogs = []

  function call(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = ++id
      pending.set(msgId, resolve)
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  }

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      consoleLogs.push(`[${msg.params.type}] ${text.slice(0, 200)}`)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleLogs.push(`[EXCEPTION] ${msg.params.exceptionDetails.text?.slice(0, 200)}`)
    }
  }

  await new Promise((r) => (ws.onopen = r))
  await call('Runtime.enable')

  async function evalJs(expression) {
    const res = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return res.result?.result?.value ?? res.result?.result?.description ?? JSON.stringify(res.result)
  }

  // 1. Inspect the current UI state
  const state = await evalJs(`(async () => {
    await new Promise(r => setTimeout(r, 1500))
    const ta = document.querySelector('textarea')
    const btns = [...document.querySelectorAll('button, a')].map(b => (b.getAttribute('aria-label') || b.textContent).trim()).filter(Boolean)
    return JSON.stringify({
      url: location.href,
      title: document.title,
      hasComposer: !!ta,
      demoBadge: document.body.innerText.includes('Demo'),
      visibleText: document.body.innerText.replace(/\\s+/g,' ').slice(0, 300),
      controls: [...new Set(btns)].slice(0, 18),
    })
  })()`)
  console.log('STATE:', state)

  // 2. If the composer exists, send a real message
  const canSend = JSON.parse(state).hasComposer
  if (canSend) {
    const sent = await evalJs(`(async () => {
      const ta = document.querySelector('textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, 'What is 17*23? Answer with just the number.')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('Send'))
      if (!send) return 'NO_SEND_BUTTON'
      send.click()
      await new Promise(r => setTimeout(r, 18000))
      const bubbles = [...document.querySelectorAll('p')].map(p => p.textContent.trim()).filter(t => t.length > 5)
      return JSON.stringify({
        streamed: bubbles.slice(-3),
        demoBadge: document.body.innerText.includes('Demo'),
        stillStreaming: !!document.querySelector('.stream-caret'),
      })
    })()`)
    console.log('SENT:', sent)
  }

  console.log('CONSOLE:', consoleLogs.length ? consoleLogs.slice(-8).join(' || ') : 'clean — no console errors')
  ws.close()
}

main().catch((e) => console.log('ERR', e.message))
